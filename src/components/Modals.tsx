import React, { useState, useEffect } from 'react';
import {
  Student,
  Lead,
  Batch,
  Course,
  CourseLecture,
  StudyMaterial,
  FeeMilestone,
  LeadStage,
  StaffMember
} from '../types';
import { LEAD_STAGES } from '../data/initialData';
import { getDeterministicStudentId, getDeterministicLeadId } from '../services/firebase';
import {
  Plus,
  Trash2,
  Printer,
  Users,
  BookOpen,
  Calendar,
  CheckCircle2,
  Upload,
  FileText,
  Share2,
  Download,
  Mail,
  MessageCircle,
  ExternalLink,
  Link2,
  Copy
} from 'lucide-react';
import { DraggableWindow } from './DraggableWindow';

/* =========================================================================
   1. STUDENT ADMISSION MODAL
   ========================================================================= */
interface StudentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (student: Student) => void;
  editingStudent?: Student | null;
  courses: Course[];
  batches: Batch[];
  nextRegId: string;
}

export const StudentModal: React.FC<StudentModalProps> = ({
  isOpen,
  onClose,
  onSave,
  editingStudent,
  courses,
  batches,
  nextRegId
}) => {
  if (!isOpen) return null;

  const [name, setName] = useState(editingStudent?.name || '');
  const [phone, setPhone] = useState(editingStudent?.phone || '');
  const [email, setEmail] = useState(editingStudent?.email || '');
  const [address, setAddress] = useState(editingStudent?.address || 'Pune');
  const [course, setCourse] = useState(editingStudent?.course || courses[0]?.name || '');
  const [batch, setBatch] = useState(editingStudent?.batch || batches[0]?.code || '');
  const [status, setStatus] = useState(editingStudent?.status || 'Active');
  const [grossFee, setGrossFee] = useState<number>(
    editingStudent?.grossFee || courses.find(c => c.name === course)?.fee || 35000
  );
  const [discount, setDiscount] = useState<number>(editingStudent?.discount || 0);
  const [notes, setNotes] = useState(editingStudent?.notes || '');

  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const safeGross = Math.max(0, Math.round(Number(grossFee) || 0));
  const safeDiscount = Math.min(safeGross, Math.max(0, Math.round(Number(discount) || 0)));
  const netFee = Math.max(0, safeGross - safeDiscount);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    if (!name.trim() || !phone.trim()) {
      setFormError('Student Full Name and Primary Phone are required.');
      return;
    }
    setFormError(null);
    setIsSubmitting(true);

    const regId = editingStudent?.regId || nextRegId;
    const enrollDate = editingStudent?.enrollDate || new Date().toISOString().split('T')[0];
    const cleanPhone = phone.trim();
    const deterministicId = getDeterministicStudentId(cleanPhone, editingStudent?.id, regId);

    const updatedStudent: Student = {
      id: deterministicId,
      regId,
      leadId: editingStudent?.leadId,
      name: name.trim(),
      phone: cleanPhone,
      whatsapp: `+91${cleanPhone.replace(/\D/g, '').slice(-10)}`,
      email: email.trim(),
      address: address.trim() || 'Pune',
      course,
      batch,
      enrollDate,
      joinDate: editingStudent?.joinDate || enrollDate,
      status: status as any,
      source: editingStudent?.source || 'Classroom Enrollment',
      grossFee: safeGross,
      discount: safeDiscount,
      netFee,
      docs: editingStudent?.docs || 'Verified Form',
      notes: notes.trim(),
      milestones: editingStudent?.milestones || [
        {
          name: 'Admission Token Deposit',
          amount: Math.round(netFee / 2),
          dueDate: enrollDate,
          status: 'Paid',
          paymentDate: enrollDate,
          mode: 'UPI',
          ref: 'UPI' + String(Date.now()).slice(-8)
        },
        {
          name: 'Final Course Installment',
          amount: Math.max(0, netFee - Math.round(netFee / 2)),
          dueDate: new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0],
          status: 'Pending',
          paymentDate: '',
          mode: 'UPI',
          ref: ''
        }
      ]
    };

    try {
      onSave(updatedStudent);
    } finally {
      setTimeout(() => setIsSubmitting(false), 800);
    }
  };

  return (
    <DraggableWindow
      isOpen={isOpen}
      onClose={onClose}
      maxWidthClass="max-w-2xl"
      title={editingStudent ? `Edit Student — ${editingStudent.name}` : 'New Student Admission'}
      bodyClassName="p-5 sm:p-6 space-y-4"
    >
        {formError && (
          <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-bold">
            ⚠️ {formError}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3.5 text-xs">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">
                Student Full Name *
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Omkar Nimbalkar"
                className="w-full px-3.5 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-900 focus:bg-white focus:outline-none focus:border-blue-500 font-medium"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">
                Primary Phone / WhatsApp *
              </label>
              <input
                type="text"
                required
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="9823011223"
                className="w-full px-3.5 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-900 font-mono-code focus:bg-white focus:outline-none focus:border-blue-500 font-medium"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">
                Course Track
              </label>
              <select
                value={course}
                onChange={(e) => {
                  setCourse(e.target.value);
                  const crs = courses.find(c => c.name === e.target.value);
                  if (crs) setGrossFee(crs.fee);
                }}
                className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-900 font-medium"
              >
                {courses.map(c => (
                  <option key={c.id} value={c.name}>{c.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">
                Batch Allocation
              </label>
              <select
                value={batch}
                onChange={(e) => setBatch(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-900 font-medium"
              >
                <option value="">Unassigned (Pending)</option>
                {batches.map(b => (
                  <option key={b.code} value={b.code}>
                    {b.code} ({b.name})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">
                Admission Status
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as any)}
                className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-900 font-medium"
              >
                <option value="Active">Active</option>
                <option value="On Hold">On Hold</option>
                <option value="Completed">Completed</option>
                <option value="Dropped">Dropped</option>
                <option value="Archived">Archived</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">
                Email Address
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="omkar@example.com"
                className="w-full px-3.5 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-900 focus:bg-white"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">
                Campus Locality in Pune
              </label>
              <input
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="e.g. Swargate, Pune"
                className="w-full px-3.5 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-900 focus:bg-white"
              />
            </div>
          </div>

          {/* Fee Billing Calculator */}
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
            <h4 className="text-[11px] font-bold text-slate-700 uppercase tracking-wider">
              Fee Billing & Scholarship Discount
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="text-[11px] text-slate-500 block mb-1">Standard Gross Fee (₹)</label>
                <input
                  type="number"
                  value={grossFee}
                  onChange={(e) => setGrossFee(Number(e.target.value) || 0)}
                  className="w-full px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-xs text-slate-900 font-mono-code"
                />
              </div>
              <div>
                <label className="text-[11px] text-slate-500 block mb-1">Scholarship / Discount (₹)</label>
                <input
                  type="number"
                  value={discount}
                  onChange={(e) => setDiscount(Number(e.target.value) || 0)}
                  className="w-full px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-xs text-slate-900 font-mono-code"
                />
              </div>
              <div>
                <label className="text-[11px] text-slate-500 block mb-1">Final Net Fee Payable</label>
                <div className="px-3 py-1.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 font-bold font-mono-code text-sm">
                  ₹{netFee.toLocaleString('en-IN')}
                </div>
              </div>
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">
              Counselor / Enrollment Notes
            </label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Needs weekend batch revision, Aadhaar verified..."
              className="w-full px-3.5 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-900 focus:bg-white"
            />
          </div>

          <div className="pt-3 border-t border-slate-100 flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className={`px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-extrabold shadow-xs transition-opacity ${
                isSubmitting ? 'opacity-70 cursor-not-allowed' : 'cursor-pointer'
              }`}
            >
              {isSubmitting ? 'Saving...' : 'Save Student Record'}
            </button>
          </div>
        </form>
    </DraggableWindow>
  );
};

/* =========================================================================
   2. LEAD / PROSPECT MODAL
   ========================================================================= */
interface LeadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (lead: Lead) => void;
  editingLead?: Lead | null;
  courses: Course[];
}

export const LeadModal: React.FC<LeadModalProps> = ({
  isOpen,
  onClose,
  onSave,
  editingLead,
  courses
}) => {
  if (!isOpen) return null;

  const today = new Date().toISOString().split('T')[0];
  const [name, setName] = useState(editingLead?.name || '');
  const [phone, setPhone] = useState(editingLead?.phone || '');
  const [email, setEmail] = useState(editingLead?.email || '');
  const [locality, setLocality] = useState(editingLead?.locality || 'Pune');
  const [course, setCourse] = useState(editingLead?.course || courses[0]?.name || '');
  const [stage, setStage] = useState<LeadStage>(editingLead?.stage || 'New Enquiry');
  const [intent, setIntent] = useState<'Hot' | 'Warm' | 'Cold'>(editingLead?.intent || 'Hot');
  const [followUpDate, setFollowUpDate] = useState(editingLead?.followUpDate || today);
  const [followUpTime, setFollowUpTime] = useState(editingLead?.followUpTime || '17:30');
  const [source, setSource] = useState(editingLead?.source || 'WhatsApp Campaign');
  const [mode, setMode] = useState(editingLead?.mode || 'Offline Classroom');
  const [staff, setStaff] = useState(editingLead?.staff || 'Counselor Team');
  const [objection, setObjection] = useState(editingLead?.objection || '');
  const [notes, setNotes] = useState(editingLead?.notes || '');

  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    if (!name.trim() || !phone.trim()) {
      setFormError('Prospect Name and Mobile Number are required.');
      return;
    }
    setFormError(null);
    setIsSubmitting(true);

    const cleanPhone = phone.trim();
    const deterministicId = getDeterministicLeadId(cleanPhone, editingLead?.id, name.trim());

    const updatedLead: Lead = {
      id: deterministicId,
      name: name.trim(),
      phone: cleanPhone,
      email: email.trim(),
      locality: locality.trim(),
      course,
      stage,
      intent,
      enquiryDate: editingLead?.enquiryDate || today,
      followUpDate,
      followUpTime,
      lastContact: today,
      source,
      mode,
      staff,
      objection: objection.trim(),
      notes: notes.trim()
    };

    try {
      onSave(updatedLead);
    } finally {
      setTimeout(() => setIsSubmitting(false), 800);
    }
  };

  return (
    <DraggableWindow
      isOpen={isOpen}
      onClose={onClose}
      maxWidthClass="max-w-2xl"
      title={editingLead ? `Edit Lead Enquiry — ${editingLead.name}` : 'New Lead Intake'}
      bodyClassName="p-5 sm:p-6 space-y-4"
    >
        {formError && (
          <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-bold">
            ⚠️ {formError}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3.5 text-xs">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">
                Prospect Full Name *
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Rohit Patil"
                className="w-full px-3.5 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-900 focus:bg-white font-medium"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">
                Mobile / WhatsApp Number *
              </label>
              <input
                type="text"
                required
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="9822114455"
                className="w-full px-3.5 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-900 font-mono-code focus:bg-white font-medium"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">
                Course Interest
              </label>
              <select
                value={course}
                onChange={(e) => setCourse(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-900 font-medium"
              >
                {courses.map(c => (
                  <option key={c.id} value={c.name}>{c.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">
                Pipeline Stage
              </label>
              <select
                value={stage}
                onChange={(e) => setStage(e.target.value as LeadStage)}
                className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-900 font-bold"
              >
                {LEAD_STAGES.map(st => (
                  <option key={st} value={st}>{st}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">
                Intent Priority
              </label>
              <select
                value={intent}
                onChange={(e) => setIntent(e.target.value as any)}
                className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-900 font-medium"
              >
                <option value="Hot">Hot 🔥</option>
                <option value="Warm">Warm ⏳</option>
                <option value="Cold">Cold ❄️</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">
                Follow-Up / Demo Date
              </label>
              <input
                type="date"
                value={followUpDate}
                onChange={(e) => setFollowUpDate(e.target.value)}
                className="w-full px-3.5 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-900 font-mono-code"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">
                Follow-Up Time
              </label>
              <input
                type="time"
                value={followUpTime}
                onChange={(e) => setFollowUpTime(e.target.value)}
                className="w-full px-3.5 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-900"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">
                Locality in Pune
              </label>
              <input
                type="text"
                value={locality}
                onChange={(e) => setLocality(e.target.value)}
                placeholder="e.g. Kothrud, Hadapsar"
                className="w-full px-3.5 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-900"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">
                Lead Source
              </label>
              <select
                value={source}
                onChange={(e) => setSource(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-900 font-medium"
              >
                <option value="WhatsApp Campaign">WhatsApp Campaign</option>
                <option value="Instagram / Meta Ad">Instagram / Meta Ad</option>
                <option value="Google Search">Google Search</option>
                <option value="Friend Referral">Friend Referral</option>
                <option value="Walk-in Visit">Walk-in Visit</option>
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">
                Preferred Mode
              </label>
              <select
                value={mode}
                onChange={(e) => setMode(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-900 font-medium"
              >
                <option value="Offline Classroom">Offline Classroom</option>
                <option value="Live Online">Live Online</option>
                <option value="Hybrid (Both)">Hybrid (Both)</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">
              Primary Prospect Objection / Query
            </label>
            <input
              type="text"
              value={objection}
              onChange={(e) => setObjection(e.target.value)}
              placeholder="e.g. Budget concern, wants weekend batch timing..."
              className="w-full px-3.5 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-900"
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">
              Internal Counseling Notes
            </label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Completed initial phone consultation, requested demo session..."
              className="w-full px-3.5 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-900"
            />
          </div>

          <div className="pt-3 border-t border-slate-100 flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className={`px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold shadow-xs transition-opacity ${
                isSubmitting ? 'opacity-70 cursor-not-allowed' : 'cursor-pointer'
              }`}
            >
              {isSubmitting ? 'Saving...' : 'Save Lead'}
            </button>
          </div>
        </form>
    </DraggableWindow>
  );
};

/* =========================================================================
   3. FEE INSTALLMENT SCHEDULE MODAL
   ========================================================================= */
interface FeeModalProps {
  isOpen: boolean;
  onClose: () => void;
  student: Student | null;
  onSaveMilestones: (studentId: string, milestones: FeeMilestone[]) => void;
  onPrintReceipt: (studentId: string, branchId?: string) => void;
  branches?: Array<{
    id: string;
    name: string;
    branchName?: string;
    isPrimary?: boolean;
    isDefault?: boolean;
  }>;
}

export const FeeModal: React.FC<FeeModalProps> = ({
  isOpen,
  onClose,
  student,
  onSaveMilestones,
  onPrintReceipt,
  branches = []
}) => {
  if (!isOpen || !student) return null;

  const [milestones, setMilestones] = useState<FeeMilestone[]>(student.milestones || []);
  const [selectedBranchId, setSelectedBranchId] = useState<string>('');
  const [confirmRemoveIdx, setConfirmRemoveIdx] = useState<number | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleAddMilestone = () => {
    const today = new Date().toISOString().split('T')[0];
    const newM: FeeMilestone = {
      name: `Installment #${milestones.length + 1}`,
      amount: 10000,
      dueDate: today,
      status: 'Pending',
      paymentDate: '',
      mode: 'UPI',
      ref: ''
    };
    setMilestones([...milestones, newM]);
  };

  const handleUpdate = (idx: number, field: keyof FeeMilestone, val: any) => {
    const updated = [...milestones];
    const nextVal = field === 'amount' ? Math.max(0, Math.round(Number(val) || 0)) : val;
    updated[idx] = { ...updated[idx], [field]: nextVal };
    if (field === 'status' && val === 'Paid' && !updated[idx].paymentDate) {
      updated[idx].paymentDate = new Date().toISOString().split('T')[0];
      if (!updated[idx].ref) {
        updated[idx].ref = 'UPI' + String(Date.now()).slice(-8);
      }
    }
    setMilestones(updated);
  };

  const handleRemove = (idx: number) => {
    const updated = milestones.filter((_, i) => i !== idx);
    setMilestones(updated);
    setConfirmRemoveIdx(null);
  };

  return (
    <DraggableWindow
      isOpen={isOpen}
      onClose={onClose}
      maxWidthClass="max-w-3xl"
      title={`Fee Ledger & Installment Milestones — ${student.name}`}
      subtitle={`${student.regId} • Net Fee: ₹${student.netFee.toLocaleString('en-IN')}`}
      bodyClassName="p-5 sm:p-6 space-y-4"
    >

        {/* Milestone Rows */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
              Installment Schedule
            </h4>
            <button
              type="button"
              onClick={handleAddMilestone}
              className="px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold flex items-center gap-1 cursor-pointer shadow-2xs"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Installment Row</span>
            </button>
          </div>

          <div className="space-y-2.5">
            {milestones.map((m, idx) => (
              <div key={idx} className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 grid grid-cols-1 sm:grid-cols-6 gap-2.5 text-xs items-center">
                <div className="sm:col-span-2">
                  <label className="text-[10px] text-slate-500 block mb-0.5 font-bold">Description</label>
                  <input
                    type="text"
                    value={m.name}
                    onChange={(e) => handleUpdate(idx, 'name', e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded-lg bg-white border border-slate-200 text-xs text-slate-900 font-medium"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-slate-500 block mb-0.5 font-bold">Amount (₹)</label>
                  <input
                    type="number"
                    value={m.amount}
                    onChange={(e) => handleUpdate(idx, 'amount', Number(e.target.value) || 0)}
                    className="w-full px-2.5 py-1.5 rounded-lg bg-white border border-slate-200 text-xs text-slate-900 font-mono-code font-bold"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-slate-500 block mb-0.5 font-bold">Due Date</label>
                  <input
                    type="date"
                    value={m.dueDate}
                    onChange={(e) => handleUpdate(idx, 'dueDate', e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded-lg bg-white border border-slate-200 text-xs text-slate-900 font-mono-code"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-slate-500 block mb-0.5 font-bold">Status</label>
                  <select
                    value={m.status}
                    onChange={(e) => handleUpdate(idx, 'status', e.target.value)}
                    className={`w-full px-2.5 py-1.5 rounded-lg border text-xs font-bold ${
                      m.status === 'Paid'
                        ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                        : m.status === 'Overdue'
                        ? 'bg-rose-50 text-rose-800 border-rose-300'
                        : 'bg-amber-50 text-amber-800 border-amber-300'
                    }`}
                  >
                    <option value="Paid">Paid</option>
                    <option value="Pending">Pending</option>
                    <option value="Overdue">Overdue</option>
                  </select>
                </div>
                <div className="flex items-end justify-center pt-3 sm:pt-0">
                  {confirmRemoveIdx === idx ? (
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => handleRemove(idx)}
                        className="px-2 py-1 rounded-lg bg-rose-600 text-white text-[10px] font-extrabold cursor-pointer"
                      >
                        Delete
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmRemoveIdx(null)}
                        className="px-2 py-1 rounded-lg bg-slate-200 text-slate-700 text-[10px] font-bold cursor-pointer"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmRemoveIdx(idx)}
                      className="p-1.5 text-slate-400 hover:text-rose-600 cursor-pointer"
                      title="Delete Installment Row"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              {branches.length > 0 && (
                <select
                  value={selectedBranchId}
                  onChange={(e) => setSelectedBranchId(e.target.value)}
                  className="px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-bold text-slate-800 focus:outline-none focus:border-blue-500"
                >
                  <option value="">Receipt Branch: Default Active</option>
                  {branches.map(b => (
                    <option key={b.id} value={b.id}>
                      {b.branchName || b.name} {(b.isDefault || b.isPrimary) ? '(Primary)' : ''}
                    </option>
                  ))}
                </select>
              )}
              <button
                type="button"
                onClick={() => onPrintReceipt(student.id, selectedBranchId || undefined)}
                className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
              >
                <Printer className="w-4 h-4" />
                <span>Print Official Tax Receipt</span>
              </button>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold cursor-pointer"
              >
                Close
              </button>
              <button
                type="button"
                disabled={isSubmitting}
                onClick={() => {
                  if (isSubmitting) return;
                  setIsSubmitting(true);
                  try {
                    onSaveMilestones(student.id, milestones);
                    onClose();
                  } finally {
                    setTimeout(() => setIsSubmitting(false), 800);
                  }
                }}
                className={`px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-extrabold shadow-xs transition-opacity ${
                  isSubmitting ? 'opacity-70 cursor-not-allowed' : 'cursor-pointer'
                }`}
              >
                {isSubmitting ? 'Saving...' : 'Save Fee Ledger'}
              </button>
            </div>
          </div>
        </div>
    </DraggableWindow>
  );
};

/* =========================================================================
   4. STUDENT 360° PROFILE DOSSIER MODAL
   ========================================================================= */
interface Student360ModalProps {
  isOpen: boolean;
  onClose: () => void;
  student: Student | null;
  onPrintReceipt: (studentId: string) => void;
}

export const Student360Modal: React.FC<Student360ModalProps> = ({
  isOpen,
  onClose,
  student,
  onPrintReceipt
}) => {
  if (!isOpen || !student) return null;

  const paid = Math.max(0, Math.round((student.milestones || []).filter(m => m.status === 'Paid').reduce((a, b) => a + b.amount, 0)));
  const balance = Math.max(0, Math.round(student.netFee - paid));

  return (
    <DraggableWindow
      isOpen={isOpen}
      onClose={onClose}
      maxWidthClass="max-w-3xl"
      title={student.name}
      subtitle={`${student.regId} • Complete 360° Academic & Financial Dossier`}
      bodyClassName="p-5 sm:p-6 space-y-5 text-slate-800"
    >

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 text-xs">
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5">
            <div className="text-[11px] font-bold uppercase text-slate-500">Academic Assignment</div>
            <div>Course: <strong className="text-slate-900">{student.course}</strong></div>
            <div>Batch: <strong className="text-blue-600 font-mono-code">{student.batch || 'Unassigned'}</strong></div>
            <div>Enrolled: <span className="font-mono-code text-slate-600">{student.enrollDate}</span></div>
          </div>

          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5">
            <div className="text-[11px] font-bold uppercase text-slate-500">Contact Details</div>
            <div>Phone: <strong className="font-mono-code text-slate-900">📱 {student.phone}</strong></div>
            <div>WhatsApp: <strong className="font-mono-code text-emerald-700">{student.whatsapp}</strong></div>
            <div>Location: <span className="text-slate-600">{student.address || 'Pune'}</span></div>
          </div>

          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5">
            <div className="text-[11px] font-bold uppercase text-slate-500">Financial Summary</div>
            <div>Net Fee: <strong className="font-mono-code text-slate-900">₹{student.netFee.toLocaleString('en-IN')}</strong></div>
            <div>Paid: <strong className="font-mono-code text-emerald-700">₹{paid.toLocaleString('en-IN')}</strong></div>
            <div>Balance: <strong className={`font-mono-code ${balance > 0 ? 'text-rose-600' : 'text-emerald-700'}`}>₹{balance.toLocaleString('en-IN')}</strong></div>
          </div>
        </div>

        {/* Milestones list */}
        <div className="space-y-2.5 text-xs">
          <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
            Installment Milestones & Verification Receipts
          </h4>
          <div className="space-y-2">
            {(student.milestones || []).map((m, idx) => (
              <div key={idx} className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between">
                <div>
                  <strong className="text-slate-900">{m.name}</strong> <span className="font-mono-code text-slate-500 text-[11px]">(Due: {m.dueDate})</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-mono-code font-bold text-slate-900">₹{m.amount.toLocaleString('en-IN')}</span>
                  <span
                    className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                      m.status === 'Paid'
                        ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                        : m.status === 'Overdue'
                        ? 'bg-rose-50 text-rose-800 border border-rose-200'
                        : 'bg-amber-50 text-amber-800 border border-amber-200'
                    }`}
                  >
                    {m.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
          <button
            onClick={() => onPrintReceipt(student.id)}
            className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-2xs"
          >
            <Printer className="w-4 h-4" />
            <span>Print A4 Receipt</span>
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold cursor-pointer"
          >
            Close Dossier
          </button>
        </div>
    </DraggableWindow>
  );
};

/* =========================================================================
   5. STAFF MANAGEMENT MODAL (CREATE & EDIT)
   ========================================================================= */
interface StaffModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (staff: StaffMember) => void;
  editingStaff?: StaffMember | null;
  batches: Batch[];
}

export const StaffModal: React.FC<StaffModalProps> = ({
  isOpen,
  onClose,
  onSave,
  editingStaff,
  batches
}) => {
  const [name, setName] = useState('');
  const [role, setRole] = useState('Senior Technical Analyst');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [salary, setSalary] = useState<number>(65000);
  const [joiningDate, setJoiningDate] = useState(new Date().toISOString().split('T')[0]);
  const [status, setStatus] = useState<'Active' | 'On Leave' | 'Inactive'>('Active');
  const [assignedBatches, setAssignedBatches] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (editingStaff) {
      setName(editingStaff.name || '');
      setRole(editingStaff.role || 'Senior Technical Analyst');
      setPhone(editingStaff.phone || '');
      setEmail(editingStaff.email || '');
      setSalary(editingStaff.salary || 65000);
      setJoiningDate(editingStaff.joiningDate || new Date().toISOString().split('T')[0]);
      setStatus(editingStaff.status || 'Active');
      setAssignedBatches(editingStaff.batches || '');
    } else {
      setName('');
      setRole('Senior Technical Analyst');
      setPhone('');
      setEmail('');
      setSalary(65000);
      setJoiningDate(new Date().toISOString().split('T')[0]);
      setStatus('Active');
      setAssignedBatches('All Batches');
    }
  }, [editingStaff, isOpen]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    if (!name.trim()) {
      setFormError('Staff Member Name is required.');
      return;
    }
    if (!phone.trim()) {
      setFormError('Staff Contact Phone is required.');
      return;
    }
    setFormError(null);
    setIsSubmitting(true);

    const cleanDigits = phone.replace(/\D/g, '').slice(-10);
    const deterministicStaffId = editingStaff?.id || (cleanDigits ? `STF_${cleanDigits}` : `STF_${Date.now()}`);

    const updatedStaff: StaffMember = {
      id: deterministicStaffId,
      name: name.trim(),
      role: role.trim(),
      phone: phone.trim(),
      email: email.trim() || `${name.toLowerCase().replace(/\s+/g, '.')}@srujaantrading.edu.in`,
      salary: Number(salary) || 0,
      joiningDate,
      batches: assignedBatches.trim() || 'All Batches',
      status
    };

    try {
      onSave(updatedStaff);
      onClose();
    } finally {
      setTimeout(() => setIsSubmitting(false), 800);
    }
  };

  return (
    <DraggableWindow
      isOpen={isOpen}
      onClose={onClose}
      maxWidthClass="max-w-xl"
      icon={
        <div className="p-2 rounded-xl bg-indigo-50 text-indigo-600 shrink-0">
          <Users className="w-5 h-5" />
        </div>
      }
      title={editingStaff ? 'Edit Staff Profile' : 'Add New Staff Member'}
      subtitle={editingStaff ? `Updating ID: ${editingStaff.id}` : 'Create an instructor, counselor, or administration profile'}
      bodyClassName="p-5 sm:p-6 space-y-4"
    >

        {formError && (
          <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-bold">
            ⚠️ {formError}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div className="space-y-1">
              <label className="block text-slate-700 font-extrabold uppercase text-[10px] tracking-wider">
                Staff Full Name <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Anand Kulkarni"
                className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-300 text-xs text-slate-900 font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div className="space-y-1">
              <label className="block text-slate-700 font-extrabold uppercase text-[10px] tracking-wider">
                Designation / Role <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                list="roles-list"
                required
                value={role}
                onChange={(e) => setRole(e.target.value)}
                placeholder="e.g. Senior Technical Analyst"
                className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-300 text-xs text-slate-900 font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <datalist id="roles-list">
                <option value="Senior Technical Analyst" />
                <option value="Options Trader Trainer" />
                <option value="Front Desk / Admissions Counselor" />
                <option value="Chief Mentor & Admin" />
                <option value="Academic Faculty" />
                <option value="Operations & Billing Desk" />
              </datalist>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div className="space-y-1">
              <label className="block text-slate-700 font-extrabold uppercase text-[10px] tracking-wider">
                Phone Number <span className="text-rose-500">*</span>
              </label>
              <input
                type="tel"
                required
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="e.g. 9822001122"
                className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-300 text-xs font-mono text-slate-900 font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div className="space-y-1">
              <label className="block text-slate-700 font-extrabold uppercase text-[10px] tracking-wider">
                Email Address
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="e.g. staff@srujaantrading.edu.in"
                className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-300 text-xs text-slate-900 font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
            <div className="space-y-1">
              <label className="block text-slate-700 font-extrabold uppercase text-[10px] tracking-wider">
                Monthly Salary (₹)
              </label>
              <input
                type="number"
                min="0"
                step="1000"
                value={salary}
                onChange={(e) => setSalary(Number(e.target.value) || 0)}
                placeholder="e.g. 65000"
                className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-300 text-xs font-mono font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div className="space-y-1">
              <label className="block text-slate-700 font-extrabold uppercase text-[10px] tracking-wider">
                Joining Date
              </label>
              <input
                type="date"
                value={joiningDate}
                onChange={(e) => setJoiningDate(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-300 text-xs font-mono text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div className="space-y-1">
              <label className="block text-slate-700 font-extrabold uppercase text-[10px] tracking-wider">
                Current Status
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as any)}
                className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-300 text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="Active">Active</option>
                <option value="On Leave">On Leave</option>
                <option value="Inactive">Inactive</option>
              </select>
            </div>
          </div>

          <div className="space-y-1">
            <label className="block text-slate-700 font-extrabold uppercase text-[10px] tracking-wider">
              Assigned Batches / Departments
            </label>
            <input
              type="text"
              value={assignedBatches}
              onChange={(e) => setAssignedBatches(e.target.value)}
              placeholder="e.g. OCT-MTB-01, OCT-FO-01 or All Batches"
              className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-300 text-xs text-slate-900 font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <div className="flex flex-wrap gap-1.5 pt-1">
              <span className="text-[10px] text-slate-400">Quick select:</span>
              <button
                type="button"
                onClick={() => setAssignedBatches('All Batches')}
                className="px-2 py-0.5 rounded-md text-[10px] bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold"
              >
                All Batches
              </button>
              {batches.map(b => (
                <button
                  key={b.code}
                  type="button"
                  onClick={() => {
                    const current = assignedBatches.split(',').map(s => s.trim()).filter(Boolean);
                    if (!current.includes(b.code)) {
                      setAssignedBatches([...current.filter(x => x !== 'All Batches'), b.code].join(', '));
                    }
                  }}
                  className="px-2 py-0.5 rounded-md text-[10px] bg-slate-100 hover:bg-slate-200 text-slate-700 font-mono"
                >
                  +{b.code}
                </button>
              ))}
            </div>
          </div>

          <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold cursor-pointer transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className={`px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-extrabold shadow-xs transition-colors ${
                isSubmitting ? 'opacity-70 cursor-not-allowed' : 'cursor-pointer'
              }`}
            >
              {isSubmitting ? 'Saving...' : editingStaff ? 'Update Record' : 'Save Staff Member'}
            </button>
          </div>
        </form>
    </DraggableWindow>
  );
};

/* =========================================================================
   6. COURSE MANAGEMENT MODAL (CREATE & EDIT)
   ========================================================================= */
interface CourseModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (course: Course) => void;
  onUpdateCourseField?: (courseId: string, field: string, value: any) => void;
  editingCourse?: Course | null;
  instructors: string[];
}

export const CourseModal: React.FC<CourseModalProps> = ({
  isOpen,
  onClose,
  onSave,
  onUpdateCourseField,
  editingCourse,
  instructors
}) => {
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [fee, setFee] = useState<number>(35000);
  const [duration, setDuration] = useState('8 Weeks (40 Hours)');
  const [mode, setMode] = useState('Offline Classroom');
  const [instructor, setInstructor] = useState('Prasad Sir');
  const [syllabus, setSyllabus] = useState('');
  const [status, setStatus] = useState<'Active' | 'Archived'>('Active');
  const [validationError, setValidationError] = useState('');

  const syncFieldIfEditing = (field: string, value: any) => {
    if (editingCourse?.id) {
      if (onUpdateCourseField) {
        onUpdateCourseField(editingCourse.id, field, value);
      } else if (typeof (window as any).updateCourseField === 'function') {
        (window as any).updateCourseField(editingCourse.id, field, value);
      }
    }
  };

  useEffect(() => {
    setValidationError('');
    if (editingCourse) {
      setCode(editingCourse.code || editingCourse.id || '');
      setName(editingCourse.name || '');
      setFee(editingCourse.fee ?? 35000);
      setDuration(editingCourse.duration || '8 Weeks (40 Hours)');
      setMode(editingCourse.mode || 'Offline Classroom');
      setInstructor(editingCourse.instructor || 'Prasad Sir');
      setSyllabus(editingCourse.syllabus || '');
      setStatus(editingCourse.status || 'Active');
    } else {
      setCode(`SSMI-CRS-0${Date.now().toString().slice(-2)}`);
      setName('');
      setFee(35000);
      setDuration('8 Weeks (40 Hours)');
      setMode('Offline Classroom');
      setInstructor('Prasad Sir');
      setSyllabus('Price action, risk management, institutional order flow, live market analysis.');
      setStatus('Active');
    }
  }, [editingCourse?.id, isOpen]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setValidationError('Course Title is required.');
      return;
    }
    if (!code.trim()) {
      setValidationError('Course Code / ID is required.');
      return;
    }

    const updatedCourse: Course = {
      id: editingCourse?.id || code.trim(),
      code: code.trim(),
      name: name.trim(),
      fee: Number(fee) || 0,
      duration: duration.trim() || '8 Weeks',
      mode,
      instructor: instructor.trim(),
      syllabus: syllabus.trim(),
      status,
      lectures: editingCourse?.lectures || []
    };

    onSave(updatedCourse);
    onClose();
  };

  return (
    <DraggableWindow
      isOpen={isOpen}
      onClose={onClose}
      maxWidthClass="max-w-xl"
      icon={
        <div className="p-2 rounded-xl bg-blue-50 text-blue-600 shrink-0">
          <BookOpen className="w-5 h-5" />
        </div>
      }
      title={editingCourse ? 'Edit Course Curriculum' : 'Add New Course'}
      subtitle={
        editingCourse
          ? `Editing: ${name || editingCourse.name} (Synced to ssm_courses_data)`
          : 'Create a curriculum track for student admissions & batches'
      }
      bodyClassName="p-5 sm:p-6 space-y-4"
    >

        {validationError && (
          <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-bold">
            {validationError}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
            <div className="space-y-1">
              <label className="block text-slate-700 font-extrabold uppercase text-[10px] tracking-wider">
                Course Code <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                value={code}
                onChange={(e) => {
                  setCode(e.target.value);
                  syncFieldIfEditing('code', e.target.value);
                }}
                placeholder="e.g. SSMI-FO-101"
                className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-300 text-xs font-mono font-bold text-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="sm:col-span-2 space-y-1">
              <label className="block text-slate-700 font-extrabold uppercase text-[10px] tracking-wider">
                Course Full Title <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  syncFieldIfEditing('name', e.target.value);
                }}
                placeholder="e.g. Complete Price Action & Stock Market Masterclass"
                className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-300 text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
            <div className="space-y-1">
              <label className="block text-slate-700 font-extrabold uppercase text-[10px] tracking-wider">
                Standard Fee (₹) <span className="text-rose-500">*</span>
              </label>
              <input
                type="number"
                min="0"
                step="500"
                required
                value={fee}
                onChange={(e) => {
                  const num = Number(e.target.value) || 0;
                  setFee(num);
                  syncFieldIfEditing('fee', num);
                }}
                className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-300 text-xs font-mono font-black text-emerald-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="space-y-1">
              <label className="block text-slate-700 font-extrabold uppercase text-[10px] tracking-wider">
                Course Duration
              </label>
              <input
                type="text"
                value={duration}
                onChange={(e) => {
                  setDuration(e.target.value);
                  syncFieldIfEditing('duration', e.target.value);
                }}
                placeholder="e.g. 8 Weeks (40 Hours)"
                className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-300 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="space-y-1">
              <label className="block text-slate-700 font-extrabold uppercase text-[10px] tracking-wider">
                Delivery Mode
              </label>
              <select
                value={mode}
                onChange={(e) => {
                  setMode(e.target.value);
                  syncFieldIfEditing('mode', e.target.value);
                }}
                className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-300 text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="Offline Classroom">Offline Classroom</option>
                <option value="Classroom">Classroom</option>
                <option value="Live Online">Live Online</option>
                <option value="Online">Online</option>
                <option value="Hybrid">Hybrid (Classroom + Online)</option>
                <option value="1-on-1">1-on-1 Mentorship</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div className="space-y-1">
              <label className="block text-slate-700 font-extrabold uppercase text-[10px] tracking-wider">
                Lead Faculty / Instructor
              </label>
              <input
                type="text"
                list="instructors-list"
                value={instructor}
                onChange={(e) => {
                  setInstructor(e.target.value);
                  syncFieldIfEditing('instructor', e.target.value);
                }}
                placeholder="e.g. Prasad Sir"
                className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-300 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <datalist id="instructors-list">
                {instructors.map((ins, i) => (
                  <option key={i} value={ins} />
                ))}
              </datalist>
            </div>

            <div className="space-y-1">
              <label className="block text-slate-700 font-extrabold uppercase text-[10px] tracking-wider">
                Catalog Status
              </label>
              <select
                value={status}
                onChange={(e) => {
                  const nextStatus = e.target.value as 'Active' | 'Archived';
                  setStatus(nextStatus);
                  syncFieldIfEditing('status', nextStatus);
                }}
                className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-300 text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="Active">Active (Accepting Enrollments)</option>
                <option value="Archived">Archived (Hidden from Admissions)</option>
              </select>
            </div>
          </div>

          <div className="space-y-1">
            <label className="block text-slate-700 font-extrabold uppercase text-[10px] tracking-wider">
              Syllabus Summary & Key Topics
            </label>
            <textarea
              rows={3}
              value={syllabus}
              onChange={(e) => {
                setSyllabus(e.target.value);
                syncFieldIfEditing('syllabus', e.target.value);
              }}
              placeholder="List key modules, practical tools, demand-supply rules, and strategies covered..."
              className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-300 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y"
            />
          </div>

          <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold cursor-pointer transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-extrabold cursor-pointer shadow-xs transition-colors"
            >
              {editingCourse ? 'Update Record' : 'Add Course'}
            </button>
          </div>
        </form>
    </DraggableWindow>
  );
};

/* =========================================================================
   7. BATCH MANAGEMENT MODAL (CREATE & EDIT)
   ========================================================================= */
interface BatchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (batch: Batch) => void;
  editingBatch?: Batch | null;
  courses: Course[];
  instructors: string[];
}

export const BatchModal: React.FC<BatchModalProps> = ({
  isOpen,
  onClose,
  onSave,
  editingBatch,
  courses,
  instructors
}) => {
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [course, setCourse] = useState(courses[0]?.name || '');
  const [mode, setMode] = useState('Offline Classroom');
  const [instructor, setInstructor] = useState('Prasad Sir');
  const [schedule, setSchedule] = useState('Mon–Fri • 08:00 AM - 10:00 AM');
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(new Date(Date.now() + 60 * 86400000).toISOString().split('T')[0]);
  const [capacity, setCapacity] = useState(25);
  const [status, setStatus] = useState<'Active' | 'Upcoming' | 'Completed' | 'Archived'>('Active');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (editingBatch) {
      setCode(editingBatch.code || '');
      setName(editingBatch.name || '');
      setCourse(editingBatch.course || courses[0]?.name || '');
      setMode(editingBatch.mode || 'Offline Classroom');
      setInstructor(editingBatch.instructor || 'Prasad Sir');
      setSchedule(editingBatch.schedule || 'Mon–Fri • 08:00 AM - 10:00 AM');
      setStartDate(editingBatch.startDate || new Date().toISOString().split('T')[0]);
      setEndDate(editingBatch.endDate || new Date(Date.now() + 60 * 86400000).toISOString().split('T')[0]);
      setCapacity(editingBatch.capacity || 25);
      setStatus(editingBatch.status || 'Active');
    } else {
      setCode(`BAT-${new Date().getFullYear()}-${Date.now().toString().slice(-3)}`);
      setName('');
      setCourse(courses[0]?.name || '');
      setMode('Offline Classroom');
      setInstructor('Prasad Sir');
      setSchedule('Mon–Fri • 08:00 AM - 10:00 AM');
      setStartDate(new Date().toISOString().split('T')[0]);
      setEndDate(new Date(Date.now() + 60 * 86400000).toISOString().split('T')[0]);
      setCapacity(25);
      setStatus('Active');
    }
  }, [editingBatch, isOpen, courses, instructors]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    if (!code.trim()) {
      setFormError('Batch Code is required.');
      return;
    }
    if (!name.trim()) {
      setFormError('Batch Name is required.');
      return;
    }
    setFormError(null);
    setIsSubmitting(true);

    const updatedBatch: Batch = {
      code: code.trim(),
      name: name.trim(),
      course,
      mode,
      instructor: instructor.trim(),
      schedule: schedule.trim(),
      startDate,
      endDate,
      capacity: Number(capacity) || 25,
      status
    };

    try {
      onSave(updatedBatch);
      onClose();
    } finally {
      setTimeout(() => setIsSubmitting(false), 800);
    }
  };

  return (
    <DraggableWindow
      isOpen={isOpen}
      onClose={onClose}
      maxWidthClass="max-w-xl"
      icon={
        <div className="p-2 rounded-xl bg-emerald-50 text-emerald-600 shrink-0">
          <Calendar className="w-5 h-5" />
        </div>
      }
      title={editingBatch ? 'Edit Batch Configuration' : 'Create New Batch'}
      subtitle={editingBatch ? `Editing: ${editingBatch.code}` : 'Schedule classroom sessions and allocate instructor'}
      bodyClassName="p-5 sm:p-6 space-y-4"
    >

        {formError && (
          <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-bold">
            ⚠️ {formError}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
            <div className="space-y-1">
              <label className="block text-slate-700 font-extrabold uppercase text-[10px] tracking-wider">
                Batch Code <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="e.g. OCT-MTB-01"
                className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-300 text-xs font-mono font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <div className="sm:col-span-2 space-y-1">
              <label className="block text-slate-700 font-extrabold uppercase text-[10px] tracking-wider">
                Batch Name <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Morning Master Blueprint Batch"
                className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-300 text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div className="space-y-1">
              <label className="block text-slate-700 font-extrabold uppercase text-[10px] tracking-wider">
                Associated Course
              </label>
              <select
                value={course}
                onChange={(e) => setCourse(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-300 text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                {courses.map(c => (
                  <option key={c.id} value={c.name}>{c.name}</option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="block text-slate-700 font-extrabold uppercase text-[10px] tracking-wider">
                Mode of Study
              </label>
              <select
                value={mode}
                onChange={(e) => setMode(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-300 text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                <option value="Offline Classroom">Offline Classroom</option>
                <option value="Online Live">Online Live</option>
                <option value="Hybrid">Hybrid</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div className="space-y-1">
              <label className="block text-slate-700 font-extrabold uppercase text-[10px] tracking-wider">
                Assigned Instructor
              </label>
              <input
                type="text"
                list="batch-instructors-list"
                value={instructor}
                onChange={(e) => setInstructor(e.target.value)}
                placeholder="e.g. Prasad Sir"
                className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-300 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
              <datalist id="batch-instructors-list">
                {instructors.map((ins, i) => (
                  <option key={i} value={ins} />
                ))}
              </datalist>
            </div>

            <div className="space-y-1">
              <label className="block text-slate-700 font-extrabold uppercase text-[10px] tracking-wider">
                Classroom Schedule
              </label>
              <input
                type="text"
                value={schedule}
                onChange={(e) => setSchedule(e.target.value)}
                placeholder="e.g. Mon–Fri • 08:00 AM - 10:00 AM"
                className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-300 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
            <div className="space-y-1">
              <label className="block text-slate-700 font-extrabold uppercase text-[10px] tracking-wider">
                Start Date
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-300 text-xs font-mono text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <div className="space-y-1">
              <label className="block text-slate-700 font-extrabold uppercase text-[10px] tracking-wider">
                End Date
              </label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-300 text-xs font-mono text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <div className="space-y-1">
              <label className="block text-slate-700 font-extrabold uppercase text-[10px] tracking-wider">
                Capacity / Status
              </label>
              <div className="flex gap-2">
                <input
                  type="number"
                  min="1"
                  max="100"
                  value={capacity}
                  onChange={(e) => setCapacity(Number(e.target.value) || 25)}
                  className="w-20 px-2.5 py-2 rounded-xl bg-slate-50 border border-slate-300 text-xs font-mono font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as any)}
                  className="flex-1 px-2.5 py-2 rounded-xl bg-slate-50 border border-slate-300 text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  <option value="Active">Active</option>
                  <option value="Upcoming">Upcoming</option>
                  <option value="Completed">Completed</option>
                  <option value="Archived">Archived</option>
                </select>
              </div>
            </div>
          </div>

          <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold cursor-pointer transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className={`px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold shadow-xs transition-colors ${
                isSubmitting ? 'opacity-70 cursor-not-allowed' : 'cursor-pointer'
              }`}
            >
              {isSubmitting ? 'Saving...' : editingBatch ? 'Update Record' : 'Create Batch'}
            </button>
          </div>
        </form>
    </DraggableWindow>
  );
};

/* =========================================================================
   8. COURSE & SYLLABUS LECTURE MODAL (ADD & EDIT LECTURE)
   ========================================================================= */
interface LectureModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (courseId: string, lecture: CourseLecture) => void;
  courses: Course[];
  batches: Batch[];
  instructors: string[];
  targetCourseId?: string | null;
  editingLecture?: CourseLecture | null;
}

export const LectureModal: React.FC<LectureModalProps> = ({
  isOpen,
  onClose,
  onSave,
  courses,
  batches,
  instructors,
  targetCourseId,
  editingLecture
}) => {
  const defaultCourseId = editingLecture?.courseId || targetCourseId || courses[0]?.id || 'CRS-01';
  const [courseId, setCourseId] = useState(defaultCourseId);
  const [title, setTitle] = useState('');
  const [module, setModule] = useState('');
  const [instructor, setInstructor] = useState('Prasad Sir');
  const [sessionType, setSessionType] = useState<'Live Class' | 'Trading Lab' | 'Recorded Video'>('Live Class');
  const [scheduledDateTime, setScheduledDateTime] = useState('');
  const [durationMins, setDurationMins] = useState<number>(120);
  const [summaryOrLink, setSummaryOrLink] = useState('');
  const [batchCode, setBatchCode] = useState(batches[0]?.code || 'OCT-MTB-01');
  const [completed, setCompleted] = useState(false);

  useEffect(() => {
    const resolvedCourseId = editingLecture?.courseId || targetCourseId || courses[0]?.id || 'CRS-01';
    const matchedCourse = courses.find(c => c.id === resolvedCourseId) || courses[0];
    const matchedBatch = batches.find(b => b.course === matchedCourse?.name) || batches[0];
    const todayStr = new Date().toISOString().split('T')[0];

    if (editingLecture) {
      setCourseId(editingLecture.courseId || resolvedCourseId);
      setTitle(editingLecture.title || '');
      setModule(editingLecture.module || 'Module 1: Core Concepts');
      setInstructor(editingLecture.instructor || matchedCourse?.instructor || 'Prasad Sir');
      setSessionType(editingLecture.sessionType || 'Live Class');
      setScheduledDateTime(editingLecture.scheduledDateTime || `${todayStr} 08:00 AM`);
      setDurationMins(editingLecture.durationMins || 120);
      setSummaryOrLink(editingLecture.summaryOrLink || '');
      setBatchCode(editingLecture.batchCode || matchedBatch?.code || 'OCT-MTB-01');
      setCompleted(Boolean(editingLecture.completed));
    } else {
      setCourseId(resolvedCourseId);
      setTitle('');
      const existingCount = (matchedCourse?.lectures || []).length;
      setModule(`Module ${existingCount + 1}: Core Trading Session`);
      setInstructor(matchedCourse?.instructor || 'Prasad Sir');
      setSessionType('Live Class');
      setScheduledDateTime(`${todayStr} 08:00 AM`);
      setDurationMins(120);
      setSummaryOrLink('');
      setBatchCode(matchedBatch?.code || 'OCT-MTB-01');
      setCompleted(false);
    }
  }, [editingLecture, targetCourseId, isOpen, courses, batches, instructors]);

  if (!isOpen) return null;

  const selectedCourse = courses.find(c => c.id === courseId) || courses[0];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!title.trim()) return;

    const newLecture: CourseLecture = {
      id: editingLecture?.id || `lec_${Date.now()}`,
      courseId: courseId || courses[0]?.id || 'CRS-01',
      title: title.trim(),
      module: module.trim() || 'Module 1',
      instructor: instructor.trim() || 'Prasad Sir',
      sessionType,
      scheduledDateTime: scheduledDateTime.trim() || new Date().toISOString().split('T')[0],
      durationMins: Number(durationMins) || 90,
      summaryOrLink: summaryOrLink.trim() || 'Live interactive session & trading checklist review.',
      completed,
      batchCode: batchCode || batches[0]?.code || 'OCT-MTB-01'
    };

    onSave(newLecture.courseId, newLecture);
    onClose();
  };

  return (
    <DraggableWindow
      isOpen={isOpen}
      onClose={onClose}
      maxWidthClass="max-w-xl"
      icon={
        <div className="p-2 rounded-xl bg-emerald-50 text-emerald-600 border border-emerald-200 shrink-0">
          <Calendar className="w-5 h-5" />
        </div>
      }
      title={editingLecture ? 'Edit Syllabus Lecture' : 'Add Syllabus Lecture & Session'}
      subtitle="Attach a structured lecture session to the course syllabus & master timetable"
      bodyClassName="p-5 sm:p-6 space-y-4"
    >

        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          {/* Hidden Course ID input as required by spec */}
          <input type="hidden" id="lectureCourseId" value={courseId} />

          {/* Target Course Read-Only Tag + Selector */}
          <div className="p-3.5 rounded-xl bg-emerald-50/70 border border-emerald-200 flex flex-wrap items-center justify-between gap-2">
            <div>
              <span className="text-[10px] font-black uppercase tracking-wider text-emerald-700 block">
                Target Course Curriculum
              </span>
              <div className="text-sm font-extrabold text-slate-900 mt-0.5 flex items-center gap-2">
                <span>{selectedCourse?.name || 'Complete Master Trader Blueprint'}</span>
                <span className="px-2 py-0.5 rounded-md text-[10px] font-mono font-bold bg-white text-emerald-700 border border-emerald-300">
                  {selectedCourse?.code || selectedCourse?.id}
                </span>
              </div>
            </div>
            <select
              value={courseId}
              onChange={(e) => {
                const nextId = e.target.value;
                setCourseId(nextId);
                const crs = courses.find(c => c.id === nextId);
                if (crs) {
                  setInstructor(crs.instructor);
                  const mb = batches.find(b => b.course === crs.name);
                  if (mb) setBatchCode(mb.code);
                }
              }}
              className="px-2.5 py-1.5 rounded-lg bg-white border border-emerald-300 text-xs font-bold text-slate-800 cursor-pointer"
            >
              {courses.map(c => (
                <option key={c.id} value={c.id}>
                  {c.code || c.id} — {c.name}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div className="space-y-1 sm:col-span-2">
              <label className="block text-slate-700 font-extrabold uppercase text-[10px] tracking-wider">
                Lecture Title <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Institutional Order Flow, BOS/CHoCH & Liquidity Sweeps"
                className="w-full px-3.5 py-2 rounded-xl bg-slate-50 border border-slate-300 text-xs font-bold text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <div className="space-y-1">
              <label className="block text-slate-700 font-extrabold uppercase text-[10px] tracking-wider">
                Module / Chapter Name
              </label>
              <input
                type="text"
                value={module}
                onChange={(e) => setModule(e.target.value)}
                placeholder="e.g. Module 2: Price Action Execution"
                className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-300 text-xs text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <div className="space-y-1">
              <label className="block text-slate-700 font-extrabold uppercase text-[10px] tracking-wider">
                Session Type
              </label>
              <select
                value={sessionType}
                onChange={(e) => setSessionType(e.target.value as any)}
                className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-300 text-xs font-bold text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                <option value="Live Class">Live Class</option>
                <option value="Trading Lab">Trading Lab</option>
                <option value="Recorded Video">Recorded Video</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div className="space-y-1">
              <label className="block text-slate-700 font-extrabold uppercase text-[10px] tracking-wider">
                Faculty / Instructor (Active Staff)
              </label>
              <select
                value={instructor}
                onChange={(e) => setInstructor(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-300 text-xs font-bold text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                {instructors.map((ins, i) => (
                  <option key={i} value={ins}>{ins}</option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="block text-slate-700 font-extrabold uppercase text-[10px] tracking-wider">
                Assigned Classroom Batch
              </label>
              <select
                value={batchCode}
                onChange={(e) => setBatchCode(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-300 text-xs font-bold text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                {batches.map(b => (
                  <option key={b.code} value={b.code}>
                    {b.code} — {b.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div className="space-y-1">
              <label className="block text-slate-700 font-extrabold uppercase text-[10px] tracking-wider">
                Scheduled Date / Time
              </label>
              <input
                type="text"
                value={scheduledDateTime}
                onChange={(e) => setScheduledDateTime(e.target.value)}
                placeholder="e.g. 2026-11-02 08:00 AM"
                className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-300 text-xs font-mono text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <div className="space-y-1">
              <label className="block text-slate-700 font-extrabold uppercase text-[10px] tracking-wider">
                Duration (Minutes)
              </label>
              <input
                type="number"
                min="15"
                max="360"
                step="15"
                value={durationMins}
                onChange={(e) => setDurationMins(Number(e.target.value) || 90)}
                className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-300 text-xs font-mono font-bold text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="block text-slate-700 font-extrabold uppercase text-[10px] tracking-wider">
              Topic Summary / Notes or Recording Link
            </label>
            <textarea
              rows={2}
              value={summaryOrLink}
              onChange={(e) => setSummaryOrLink(e.target.value)}
              placeholder="Enter key learning outcomes, chart setup rules, or Google Drive / Zoom recording link..."
              className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-300 text-xs text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          <label className="inline-flex items-center gap-2 text-xs font-bold text-slate-700 cursor-pointer">
            <input
              type="checkbox"
              checked={completed}
              onChange={(e) => setCompleted(e.target.checked)}
              className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
            />
            <span>Mark this lecture session as Completed</span>
          </label>

          <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold cursor-pointer transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold cursor-pointer shadow-xs transition-colors"
            >
              {editingLecture ? 'Update Lecture' : 'Save Lecture to Syllabus'}
            </button>
          </div>
        </form>
    </DraggableWindow>
  );
};

/* =========================================================================
   9. STUDY MATERIAL UPLOAD & CLOUD LINK MODAL (CREATE & EDIT)
   ========================================================================= */
interface StudyMaterialModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (material: StudyMaterial) => void;
  courses: Course[];
  batches: Batch[];
  editingMaterial?: StudyMaterial | null;
}

export const StudyMaterialModal: React.FC<StudyMaterialModalProps> = ({
  isOpen,
  onClose,
  onSave,
  courses,
  batches,
  editingMaterial
}) => {
  const [uploadMode, setUploadMode] = useState<'file' | 'link'>('file');
  const [title, setTitle] = useState('');
  const [courseId, setCourseId] = useState(courses[0]?.id || 'CRS-01');
  const [fileType, setFileType] = useState<'PDF' | 'DOCX' | 'PPTX' | 'LINK' | 'ZIP' | 'IMAGE'>('PDF');
  const [fileSize, setFileSize] = useState('1.2 MB');
  const [fileName, setFileName] = useState('');
  const [fileData, setFileData] = useState('');
  const [batchAccess, setBatchAccess] = useState('All Batches');
  const [summary, setSummary] = useState('');
  const [uploadNotice, setUploadNotice] = useState<string | null>(null);

  useEffect(() => {
    if (editingMaterial) {
      setTitle(editingMaterial.title || '');
      const matchedCourse =
        courses.find(c => c.id === editingMaterial.courseId || c.name === editingMaterial.course) || courses[0];
      setCourseId(matchedCourse?.id || 'CRS-01');
      setFileType(editingMaterial.fileType || 'PDF');
      setFileSize(editingMaterial.fileSize || '1.2 MB');
      setFileName(editingMaterial.fileName || '');
      setFileData(editingMaterial.fileData || '');
      setBatchAccess(editingMaterial.batchAccess || 'All Batches');
      setSummary(editingMaterial.summary || '');
      setUploadMode(editingMaterial.fileType === 'LINK' ? 'link' : 'file');
      setUploadNotice(null);
    } else {
      setTitle('');
      setCourseId(courses[0]?.id || 'CRS-01');
      setFileType('PDF');
      setFileSize('1.2 MB');
      setFileName('');
      setFileData('');
      setBatchAccess('All Batches');
      setSummary('');
      setUploadMode('file');
      setUploadNotice(null);
    }
  }, [editingMaterial, isOpen, courses]);

  if (!isOpen) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const kb = file.size / 1024;
    const readableSize = kb >= 1024 ? `${(kb / 1024).toFixed(2)} MB` : `${Math.max(1, Math.round(kb))} KB`;
    setFileSize(readableSize);
    setFileName(file.name);

    if (!title.trim()) {
      setTitle(file.name);
    }

    const ext = file.name.split('.').pop()?.toUpperCase() || '';
    if (ext === 'PDF') setFileType('PDF');
    else if (ext === 'DOCX' || ext === 'DOC') setFileType('DOCX');
    else if (ext === 'PPTX' || ext === 'PPT') setFileType('PPTX');
    else if (ext === 'ZIP' || ext === 'RAR') setFileType('ZIP');
    else if (['PNG', 'JPG', 'JPEG', 'WEBP'].includes(ext)) setFileType('IMAGE');
    else setFileType('PDF');

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setFileData(reader.result);
        setUploadNotice(`✓ Attached "${file.name}" (${readableSize}) — Ready to save & distribute`);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!title.trim()) return;

    const selectedCourse = courses.find(c => c.id === courseId) || courses[0];
    const resolvedFileType = uploadMode === 'link' ? 'LINK' : fileType;
    const resolvedFileData =
      fileData.trim() ||
      'data:text/plain;charset=utf-8,' +
        encodeURIComponent(
          `SRUJAAN SHARE MARKET INSTITUTE — STUDY MATERIAL\n` +
            `==================================================\n` +
            `Title: ${title.trim()}\n` +
            `Course: ${selectedCourse?.name || 'All Courses'}\n` +
            `Batch Access: ${batchAccess}\n` +
            `Date: ${new Date().toISOString().split('T')[0]}\n\n` +
            `Notes & Study Summary:\n${summary.trim() || 'Official Srujaan Share Market Institute learning handout.'}\n`
        );

    const newMaterial: StudyMaterial = {
      id: editingMaterial?.id || `mat_${Date.now()}`,
      title: title.trim(),
      courseId: selectedCourse?.id || 'CRS-01',
      course: selectedCourse?.name || 'Complete Master Trader Blueprint',
      fileType: resolvedFileType,
      type:
        resolvedFileType === 'LINK'
          ? 'External Cloud Resource'
          : `${resolvedFileType} Study Material`,
      fileSize: uploadMode === 'link' ? 'Cloud Link' : fileSize,
      fileName: fileName || `${title.trim().replace(/[^a-zA-Z0-9._-]/g, '_')}.txt`,
      fileData: resolvedFileData,
      uploadDate: editingMaterial?.uploadDate || new Date().toISOString().split('T')[0],
      batchAccess,
      summary: summary.trim() || 'Official course handout and practical trading reference checklist.'
    };

    onSave(newMaterial);
    onClose();
  };

  return (
    <DraggableWindow
      isOpen={isOpen}
      onClose={onClose}
      maxWidthClass="max-w-xl"
      icon={
        <div className="p-2 rounded-xl bg-indigo-50 text-indigo-600 border border-indigo-200 shrink-0">
          <Upload className="w-5 h-5" />
        </div>
      }
      title={editingMaterial ? 'Edit Study Material' : 'Upload & Save Study Material'}
      subtitle="Upload PDFs, PPTX, DOCX, ZIP files or attach Google Drive links for student distribution"
      bodyClassName="p-5 sm:p-6 space-y-4"
    >

        {/* Mode Switcher Tabs: Local File Upload vs External Cloud Link */}
        <div className="p-1 rounded-xl bg-slate-100 border border-slate-200 grid grid-cols-1 sm:grid-cols-2 gap-1 text-xs font-bold">
          <button
            type="button"
            onClick={() => {
              setUploadMode('file');
              if (fileType === 'LINK') setFileType('PDF');
            }}
            className={`py-2 px-3 rounded-lg flex items-center justify-center gap-1.5 cursor-pointer transition-all ${
              uploadMode === 'file' ? 'bg-white text-indigo-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Upload className="w-3.5 h-3.5" />
            <span>Upload File (PDF / DOCX / PPTX / ZIP)</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setUploadMode('link');
              setFileType('LINK');
            }}
            className={`py-2 px-3 rounded-lg flex items-center justify-center gap-1.5 cursor-pointer transition-all ${
              uploadMode === 'link' ? 'bg-white text-indigo-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Link2 className="w-3.5 h-3.5" />
            <span>External Cloud / Drive Link</span>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          {uploadMode === 'file' ? (
            <div className="p-4 rounded-2xl border-2 border-dashed border-indigo-300 bg-indigo-50/40 hover:bg-indigo-50/70 transition-colors text-center space-y-2">
              <FileText className="w-8 h-8 text-indigo-600 mx-auto" />
              <div className="font-extrabold text-slate-900 text-xs">
                Select Study Material File from Your Device
              </div>
              <p className="text-[11px] text-slate-500">
                Supports PDF, PPTX, DOCX, ZIP, PNG/JPG, TXT • Converted & stored safely for offline download & WhatsApp sharing
              </p>
              <div className="pt-1">
                <label className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-extrabold cursor-pointer shadow-xs transition-colors">
                  <Upload className="w-3.5 h-3.5" />
                  <span>Choose File to Upload</span>
                  <input
                    type="file"
                    accept=".pdf,.pptx,.ppt,.docx,.doc,.zip,.png,.jpg,.jpeg,.webp,.txt,.csv"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                </label>
              </div>
              {uploadNotice && (
                <div className="text-emerald-700 font-bold text-xs bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-lg inline-block mt-2">
                  {uploadNotice}
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-1">
              <label className="block text-slate-700 font-extrabold uppercase text-[10px] tracking-wider">
                Google Drive / Dropbox / YouTube Private URL <span className="text-rose-500">*</span>
              </label>
              <input
                type="url"
                value={fileData.startsWith('http') ? fileData : ''}
                onChange={(e) => setFileData(e.target.value)}
                placeholder="https://drive.google.com/file/d/..."
                className="w-full px-3.5 py-2 rounded-xl bg-slate-50 border border-slate-300 text-xs font-mono text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div className="sm:col-span-2 space-y-1">
              <label className="block text-slate-700 font-extrabold uppercase text-[10px] tracking-wider">
                Document / Material Title <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Complete Price Action Trading PDF Handbook"
                className="w-full px-3.5 py-2 rounded-xl bg-slate-50 border border-slate-300 text-xs font-bold text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div className="space-y-1">
              <label className="block text-slate-700 font-extrabold uppercase text-[10px] tracking-wider">
                Associated Course
              </label>
              <select
                value={courseId}
                onChange={(e) => setCourseId(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-300 text-xs font-bold text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                {courses.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="block text-slate-700 font-extrabold uppercase text-[10px] tracking-wider">
                Batch Access Permission
              </label>
              <select
                value={batchAccess}
                onChange={(e) => setBatchAccess(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-300 text-xs font-bold text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="All Batches">All Batches</option>
                {batches.map(b => (
                  <option key={b.code} value={b.code}>
                    {b.code} — {b.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div className="space-y-1">
              <label className="block text-slate-700 font-extrabold uppercase text-[10px] tracking-wider">
                Format / File Type
              </label>
              <select
                value={fileType}
                onChange={(e) => setFileType(e.target.value as any)}
                className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-300 text-xs font-bold text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="PDF">PDF Document</option>
                <option value="PPTX">PPTX Presentation</option>
                <option value="DOCX">DOCX Workbook</option>
                <option value="ZIP">ZIP Archive / Templates</option>
                <option value="IMAGE">Chart / Infographic Image</option>
                <option value="LINK">External Cloud Link</option>
              </select>
            </div>

            <div className="space-y-1">
              <label className="block text-slate-700 font-extrabold uppercase text-[10px] tracking-wider">
                File Size Label
              </label>
              <input
                type="text"
                value={fileSize}
                onChange={(e) => setFileSize(e.target.value)}
                placeholder="e.g. 2.4 MB"
                className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-300 text-xs font-mono text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="block text-slate-700 font-extrabold uppercase text-[10px] tracking-wider">
              Study Notes / Description for Students
            </label>
            <textarea
              rows={3}
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              placeholder="Describe the contents, chapters, or trading rules inside this study material..."
              className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-300 text-xs text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold cursor-pointer transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold cursor-pointer shadow-xs transition-colors flex items-center gap-1.5"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>{editingMaterial ? 'Update Study Material' : 'Save & Publish Study Material'}</span>
            </button>
          </div>
        </form>
    </DraggableWindow>
  );
};

/* =========================================================================
   10. SHARE STUDY MATERIAL TO STUDENTS (WHATSAPP & EMAIL DISTRIBUTION MODAL)
   ========================================================================= */
interface ShareMaterialWhatsAppModalProps {
  isOpen: boolean;
  onClose: () => void;
  material: StudyMaterial | null;
  students: Student[];
  instituteName: string;
  onDownloadMaterial: (material: StudyMaterial) => void;
}

export const ShareMaterialWhatsAppModal: React.FC<ShareMaterialWhatsAppModalProps> = ({
  isOpen,
  onClose,
  material,
  students,
  instituteName,
  onDownloadMaterial
}) => {
  const [studentSearch, setStudentSearch] = useState('');
  const [onlyEnrolledCourse, setOnlyEnrolledCourse] = useState(false);
  const [copiedBanner, setCopiedBanner] = useState(false);
  const [messageTemplate, setMessageTemplate] = useState('');

  useEffect(() => {
    if (material) {
      const linkLine =
        material.fileData && material.fileData.startsWith('http')
          ? `\n🔗 Direct Access Link: ${material.fileData}`
          : `\n📎 File Name: ${material.fileName || material.title} (${material.fileSize || '1.5 MB'})`;
      setMessageTemplate(
        `📚 *New Study Material Shared — ${instituteName}*\n\n` +
          `*Document:* ${material.title}\n` +
          `*Course:* ${material.course}\n` +
          `*Batch Access:* ${material.batchAccess || 'All Batches'}\n` +
          `*Summary:* ${material.summary}${linkLine}\n\n` +
          `Please review this study material before your next trading session!`
      );
    }
  }, [material, instituteName]);

  if (!isOpen || !material) return null;

  const activeStudents = students.filter(s => s.status !== 'Archived');
  const filteredStudents = activeStudents.filter(s => {
    if (onlyEnrolledCourse && s.course !== material.course) return false;
    if (studentSearch.trim()) {
      const q = studentSearch.toLowerCase().trim();
      if (!`${s.name} ${s.regId} ${s.phone} ${s.batch} ${s.course}`.toLowerCase().includes(q)) {
        return false;
      }
    }
    return true;
  });

  const handleSendToStudentWhatsApp = (student: Student) => {
    const cleanPhone = (student.whatsapp || student.phone || '').replace(/\D/g, '').slice(-10);
    const fullPhone = cleanPhone.length === 10 ? `91${cleanPhone}` : cleanPhone;
    const personalized = `Hello *${student.name}* (${student.regId}),\n\n${messageTemplate}`;
    const waUrl = `https://api.whatsapp.com/send?phone=${fullPhone}&text=${encodeURIComponent(personalized)}`;
    window.open(waUrl, '_blank', 'noopener,noreferrer');
  };

  const handleGroupBroadcastWhatsApp = () => {
    const waUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(messageTemplate)}`;
    window.open(waUrl, '_blank', 'noopener,noreferrer');
  };

  const handleEmailBroadcast = () => {
    const emails = filteredStudents.map(s => s.email).filter(Boolean).join(',');
    const subject = encodeURIComponent(`Study Material: ${material.title} — ${instituteName}`);
    const body = encodeURIComponent(messageTemplate.replace(/\*/g, ''));
    window.location.href = `mailto:${emails}?subject=${subject}&body=${body}`;
  };

  return (
    <DraggableWindow
      isOpen={isOpen}
      onClose={onClose}
      maxWidthClass="max-w-2xl"
      icon={
        <div className="p-2 rounded-xl bg-emerald-50 text-emerald-600 border border-emerald-200 shrink-0">
          <Share2 className="w-5 h-5" />
        </div>
      }
      title="Send Study Material to Students"
      subtitle={`Distribute "${material.title}" via WhatsApp, Email, or local file attachment`}
      bodyClassName="p-5 sm:p-6 space-y-4"
    >

        {/* File Quick Download + Broadcast Bar */}
        <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div>
            <div className="font-extrabold text-slate-900">{material.title}</div>
            <div className="text-slate-500 mt-0.5">
              Course: <strong className="text-indigo-600">{material.course}</strong> • Format:{' '}
              <strong>{material.fileType || 'PDF'}</strong> ({material.fileSize || '1.5 MB'})
            </div>
          </div>
          <button
            type="button"
            onClick={() => onDownloadMaterial(material)}
            className="w-full sm:w-auto min-h-[44px] sm:min-h-0 px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold flex items-center justify-center gap-1.5 cursor-pointer shadow-xs transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Download File to Attach</span>
          </button>
        </div>

        {/* Editable Broadcast Message Template */}
        <div className="space-y-1.5 text-xs">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label className="text-slate-700 font-extrabold uppercase text-[10px] tracking-wider">
              WhatsApp & Email Distribution Message
            </label>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard?.writeText(messageTemplate);
                  setCopiedBanner(true);
                  setTimeout(() => setCopiedBanner(false), 2500);
                }}
                className="min-h-[38px] sm:min-h-0 px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold flex items-center gap-1 cursor-pointer"
              >
                <Copy className="w-3 h-3" />
                <span>{copiedBanner ? '✓ Copied!' : 'Copy Message'}</span>
              </button>
              <button
                type="button"
                onClick={handleGroupBroadcastWhatsApp}
                className="min-h-[38px] sm:min-h-0 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold flex items-center gap-1 cursor-pointer"
              >
                <MessageCircle className="w-3 h-3" />
                <span>Share to WhatsApp Group</span>
              </button>
              <button
                type="button"
                onClick={handleEmailBroadcast}
                className="min-h-[38px] sm:min-h-0 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold flex items-center gap-1 cursor-pointer"
              >
                <Mail className="w-3 h-3" />
                <span>Email All</span>
              </button>
            </div>
          </div>
          <textarea
            rows={4}
            value={messageTemplate}
            onChange={(e) => setMessageTemplate(e.target.value)}
            className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-300 text-xs text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>

        {/* Individual Enrolled Student Dispatcher */}
        <div className="space-y-3 pt-2 border-t border-slate-100 text-xs">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-extrabold text-slate-900">
              Send Directly to Enrolled Students ({filteredStudents.length})
            </span>
            <label className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-600 cursor-pointer">
              <input
                type="checkbox"
                checked={onlyEnrolledCourse}
                onChange={(e) => setOnlyEnrolledCourse(e.target.checked)}
                className="rounded border-slate-300 text-indigo-600"
              />
              <span>Only {material.course} students</span>
            </label>
          </div>

          <input
            type="text"
            value={studentSearch}
            onChange={(e) => setStudentSearch(e.target.value)}
            placeholder="Search student by name, phone, batch or ID..."
            className="w-full px-3.5 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />

          <div className="max-h-56 overflow-y-auto divide-y divide-slate-100 border border-slate-200 rounded-xl">
            {filteredStudents.length === 0 ? (
              <div className="p-4 text-center text-slate-400">
                No matching students found. Uncheck the course filter to view all institute students.
              </div>
            ) : (
              filteredStudents.map(st => (
                <div key={st.id} className="p-3 flex items-center justify-between gap-2 hover:bg-slate-50">
                  <div>
                    <div className="font-bold text-slate-900">
                      {st.name} <span className="font-mono text-[11px] text-indigo-600">({st.regId})</span>
                    </div>
                    <div className="text-[11px] text-slate-500">
                      {st.course} • Batch: <strong>{st.batch || 'Unassigned'}</strong> • 📱 {st.phone}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => handleSendToStudentWhatsApp(st)}
                      className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs flex items-center gap-1.5 cursor-pointer shadow-2xs transition-colors"
                    >
                      <MessageCircle className="w-3.5 h-3.5" />
                      <span>Send on WhatsApp</span>
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
    </DraggableWindow>
  );
};

/* =========================================================================
   11. BATCH ROSTER & STUDENT TRANSFER MODAL
   ========================================================================= */
interface BatchRosterModalProps {
  isOpen: boolean;
  onClose: () => void;
  batchCode: string | null;
  batches: Batch[];
  students: Student[];
  onAssignStudentToBatch: (studentId: string, batchCode: string) => void;
}

export const BatchRosterModal: React.FC<BatchRosterModalProps> = ({
  isOpen,
  onClose,
  batchCode,
  batches,
  students,
  onAssignStudentToBatch
}) => {
  if (!isOpen || !batchCode) return null;
  const batch = batches.find(b => b.code === batchCode);
  const enrolled = students.filter(s => s.batch === batchCode && s.status !== 'Archived');
  const otherStudents = students.filter(s => s.batch !== batchCode && s.status !== 'Archived');

  return (
    <DraggableWindow
      isOpen={isOpen}
      onClose={onClose}
      maxWidthClass="max-w-2xl"
      title={`Batch Roster & Transfers — ${batch?.name || batchCode} (${batchCode})`}
      subtitle={`${enrolled.length} / ${batch?.capacity || 25} Seats Occupied • Instructor: ${batch?.instructor}`}
      bodyClassName="p-5 sm:p-6 space-y-4 text-xs"
    >

        <div className="space-y-2">
          <h4 className="font-extrabold text-slate-800 uppercase text-[11px] tracking-wider">
            Current Enrolled Students ({enrolled.length})
          </h4>
          {enrolled.length === 0 ? (
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-slate-500 text-center">
              No students currently assigned to {batchCode}.
            </div>
          ) : (
            <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl max-h-52 overflow-y-auto">
              {enrolled.map(s => (
                <div key={s.id} className="p-3 flex items-center justify-between gap-2">
                  <div>
                    <strong className="text-slate-900">{s.name}</strong>{' '}
                    <span className="font-mono text-blue-600">({s.regId})</span>
                    <div className="text-[11px] text-slate-500">📱 {s.phone} • {s.course}</div>
                  </div>
                  <select
                    value={s.batch}
                    onChange={(e) => onAssignStudentToBatch(s.id, e.target.value)}
                    className="px-2.5 py-1 rounded-lg bg-slate-50 border border-slate-300 text-xs font-bold text-slate-800"
                  >
                    <option value="">Unassign</option>
                    {batches.map(b => (
                      <option key={b.code} value={b.code}>Move to {b.code}</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          )}
        </div>

        {otherStudents.length > 0 && (
          <div className="space-y-2 pt-2 border-t border-slate-100">
            <h4 className="font-extrabold text-slate-800 uppercase text-[11px] tracking-wider">
              Quick Add Student to {batchCode}
            </h4>
            <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl max-h-44 overflow-y-auto">
              {otherStudents.map(s => (
                <div key={s.id} className="p-2.5 flex items-center justify-between gap-2">
                  <div>
                    <strong className="text-slate-900">{s.name}</strong>{' '}
                    <span className="text-slate-500">({s.batch || 'Unassigned'})</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => onAssignStudentToBatch(s.id, batchCode)}
                    className="px-3 py-1 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold cursor-pointer"
                  >
                    + Assign to {batchCode}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
    </DraggableWindow>
  );
};


