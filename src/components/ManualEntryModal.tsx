import React, { useState, useEffect } from 'react';
import {
  UserPlus,
  Phone,
  Mail,
  BookOpen,
  MapPin,
  Clock,
  IndianRupee,
  AlertTriangle,
  CheckCircle2,
  Sparkles,
  FileText,
  Globe,
  ShieldCheck
} from 'lucide-react';
import { AppState, Student, Lead, FeeMilestone } from '../types';
import {
  findExistingStudentDuplicate,
  normalizePhone10,
  enqueueOfflineRecord,
  sendCorsSafeAppsScriptRequest,
  PRIMARY_INSTITUTE_EMAIL
} from '../services/storageManager';
import { getDeterministicStudentId, getDeterministicLeadId } from '../services/db';
import { DraggableWindow } from './DraggableWindow';

interface ManualEntryModalProps {
  isOpen: boolean;
  onClose: () => void;
  state: AppState;
  onSaveStudent: (student: Student) => Promise<void> | void;
  onSaveLead?: (lead: Lead) => Promise<void> | void;
  onEditExistingStudent?: (student: Student) => void;
  initialStudent?: Student | null;
}

export const COURSE_PRESETS = [
  { name: 'Basic Course', defaultFee: 5000 },
  { name: 'Advance Stock Market', defaultFee: 7500 },
  { name: 'Futures & Options', defaultFee: 10000 },
  { name: 'Forex & Crypto', defaultFee: 9000 },
  { name: 'Complete Trader Program', defaultFee: 25000 },
  { name: 'Custom', defaultFee: 5000 }
];

export const BRANCH_PRESETS = [
  'Sane Chowk (Chinchwad)',
  'Patil Nagar (Chikhali)',
  'Chinchwad',
  'Chikhali',
  'Solapur',
  'Online / Hybrid'
];

export const BATCH_PRESETS = ['Morning', 'Afternoon', 'Evening', 'Weekend'];
export const LANGUAGE_PRESETS = ['Marathi', 'Hindi', 'English'];
export const PAYMENT_MODES = ['UPI', 'Cash', 'Bank Transfer', 'Card'];

export const ManualEntryModal: React.FC<ManualEntryModalProps> = ({
  isOpen,
  onClose,
  state,
  onSaveStudent,
  onSaveLead,
  onEditExistingStudent,
  initialStudent
}) => {
  const [entryType, setEntryType] = useState<'student' | 'lead'>('student');
  const [name, setName] = useState('');
  const [mobile, setMobile] = useState('');
  const [email, setEmail] = useState('');
  const [course, setCourse] = useState('Basic Course');
  const [customCourseName, setCustomCourseName] = useState('');
  const [branch, setBranch] = useState('Sane Chowk (Chinchwad)');
  const [batch, setBatch] = useState('Morning');
  const [language, setLanguage] = useState('Marathi');
  const [totalFee, setTotalFee] = useState<number>(5000);
  const [amountPaid, setAmountPaid] = useState<number>(5000);
  const [feeStatus, setFeeStatus] = useState<'Paid' | 'Partial' | 'Pending'>('Paid');
  const [paymentMode, setPaymentMode] = useState('UPI');
  const [notes, setNotes] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [overrideExisting, setOverrideExisting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      if (initialStudent) {
        setEntryType('student');
        setName(initialStudent.name || '');
        setMobile(normalizePhone10(initialStudent.phone));
        setEmail(initialStudent.email || '');
        setCourse(initialStudent.course || 'Basic Course');
        setBranch((initialStudent as any).branch || initialStudent.address || 'Sane Chowk (Chinchwad)');
        setBatch(initialStudent.batch || 'Morning');
        setLanguage((initialStudent as any).language || 'Marathi');
        const net = Number(initialStudent.netFee) || 5000;
        const paid = (initialStudent.milestones || [])
          .filter(m => m.status === 'Paid')
          .reduce((s, m) => s + (Number(m.amount) || 0), 0);
        setTotalFee(net);
        setAmountPaid(paid);
        setFeeStatus(paid >= net ? 'Paid' : paid > 0 ? 'Partial' : 'Pending');
        setNotes(initialStudent.notes || '');
        setOverrideExisting(true);
      } else {
        setName('');
        setMobile('');
        setEmail('');
        setCourse('Basic Course');
        setCustomCourseName('');
        setBranch('Sane Chowk (Chinchwad)');
        setBatch('Morning');
        setLanguage('Marathi');
        setTotalFee(5000);
        setAmountPaid(5000);
        setFeeStatus('Paid');
        setPaymentMode('UPI');
        setNotes('');
        setOverrideExisting(false);
      }
      setErrorMsg(null);
      setIsSubmitting(false);
    }
  }, [isOpen, initialStudent]);

  if (!isOpen) return null;

  // Auto-update fee when course changes
  const handleCourseChange = (selected: string) => {
    setCourse(selected);
    const found = COURSE_PRESETS.find(c => c.name === selected);
    if (found && selected !== 'Custom') {
      setTotalFee(found.defaultFee);
      if (feeStatus === 'Paid') {
        setAmountPaid(found.defaultFee);
      } else if (feeStatus === 'Pending') {
        setAmountPaid(0);
      }
    }
  };

  const handleFeeStatusChange = (status: 'Paid' | 'Partial' | 'Pending') => {
    setFeeStatus(status);
    if (status === 'Paid') {
      setAmountPaid(totalFee);
    } else if (status === 'Pending') {
      setAmountPaid(0);
    } else if (status === 'Partial' && (amountPaid === 0 || amountPaid >= totalFee)) {
      setAmountPaid(Math.round(totalFee / 2));
    }
  };

  const balanceDue = Math.max(0, (Number(totalFee) || 0) - (Number(amountPaid) || 0));

  // Real-time duplicate detection on phone or name
  const duplicateMatch = !initialStudent
    ? findExistingStudentDuplicate(state.students || [], mobile, name)
    : null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    const cleanName = name.trim();
    const cleanPhone = normalizePhone10(mobile);

    if (!cleanName) {
      setErrorMsg('Student / Prospect Name is required.');
      return;
    }
    if (cleanPhone.length !== 10) {
      setErrorMsg('Please enter a valid 10-digit Mobile Number.');
      return;
    }

    setErrorMsg(null);
    setIsSubmitting(true);

    try {
      const nowIso = new Date().toISOString();
      const today = nowIso.split('T')[0];
      const resolvedCourse = course === 'Custom' ? customCourseName.trim() || 'Custom Course' : course;

      if (entryType === 'lead' && onSaveLead) {
        const leadId = getDeterministicLeadId(cleanPhone, undefined, cleanName);
        const newLead: Lead = {
          id: leadId,
          name: cleanName,
          phone: cleanPhone,
          email: email.trim(),
          locality: branch,
          course: resolvedCourse,
          stage: 'New Enquiry',
          intent: 'Hot',
          enquiryDate: today,
          followUpDate: today,
          followUpTime: '17:00',
          lastContact: today,
          source: 'Manual Entry',
          mode: branch.includes('Online') ? 'Online Live' : 'Offline Classroom',
          staff: 'Admissions Desk',
          objection: notes.trim() || 'None',
          notes: notes.trim()
        };
        await onSaveLead(newLead);

        // Background push to Google Sheets (`srujaansharemarketpune@gmail.com`)
        const recordPayload = {
          record_id: leadId,
          updated_at: nowIso,
          studentName: cleanName,
          mobile: cleanPhone,
          email: email.trim(),
          course: resolvedCourse,
          branch,
          batch,
          language,
          totalFee: Number(totalFee) || 0,
          feeAmount: 0,
          balanceDue: Number(totalFee) || 0,
          feeStatus: 'Inquiry',
          paymentMode,
          source: 'Manual Entry',
          notes: notes.trim()
        };
        enqueueOfflineRecord({
          record_id: leadId,
          updated_at: nowIso,
          entityType: 'lead',
          action: 'UPSERT',
          payload: recordPayload
        }).catch(() => {});

        if (typeof navigator !== 'undefined' && navigator.onLine) {
          sendCorsSafeAppsScriptRequest({
            action: 'sync_batch',
            records: [recordPayload]
          }).catch(() => {});
        }

        onClose();
        return;
      }

      // Student Admission Entry
      const targetId =
        initialStudent?.id ||
        (overrideExisting && duplicateMatch ? duplicateMatch.id : getDeterministicStudentId(cleanPhone, undefined, undefined, cleanName));

      const targetRegId =
        initialStudent?.regId ||
        (overrideExisting && duplicateMatch
          ? duplicateMatch.regId
          : `SSMI-${String(1001 + (state.students?.length || 0)).slice(-4)}`);

      const paidVal = Math.max(0, Number(amountPaid) || 0);
      const totalVal = Math.max(paidVal, Number(totalFee) || 0);
      const remainingVal = Math.max(0, totalVal - paidVal);

      const milestones: FeeMilestone[] = [];
      if (paidVal > 0) {
        milestones.push({
          name: remainingVal === 0 ? 'Full Course Fee' : '1st Installment (Admission)',
          amount: paidVal,
          dueDate: today,
          status: 'Paid',
          paymentDate: today,
          mode: paymentMode,
          ref: `MAN-${Date.now().toString().slice(-5)}`
        });
      }
      if (remainingVal > 0) {
        milestones.push({
          name: paidVal > 0 ? '2nd Installment (Balance)' : 'Course Fee Pending',
          amount: remainingVal,
          dueDate: today,
          status: 'Pending',
          mode: paymentMode
        });
      }

      const studentRecord: Student = {
        id: targetId,
        regId: targetRegId,
        name: cleanName,
        phone: cleanPhone,
        whatsapp: cleanPhone,
        email: email.trim(),
        address: branch,
        course: resolvedCourse,
        batch,
        enrollDate: initialStudent?.enrollDate || today,
        joinDate: initialStudent?.joinDate || today,
        status: 'Active',
        source: 'Manual Entry',
        grossFee: totalVal,
        discount: 0,
        netFee: totalVal,
        docs: 'Verified',
        notes: notes.trim() ? `[${language}] ${notes.trim()}` : `Language: ${language} | Branch: ${branch}`,
        milestones
      };

      (studentRecord as any).record_id = targetId;
      (studentRecord as any).updated_at = nowIso;
      (studentRecord as any).branch = branch;
      (studentRecord as any).language = language;

      // 1. Instant 0ms Local Save + Dashboard UI Update
      await onSaveStudent(studentRecord);

      // 2. Queue & Background Sync to Connected Google Sheet (`srujaansharemarketpune@gmail.com`)
      const sheetPayload = {
        record_id: targetId,
        updated_at: nowIso,
        studentName: cleanName,
        mobile: cleanPhone,
        email: email.trim(),
        course: resolvedCourse,
        branch,
        batch,
        language,
        totalFee: totalVal,
        feeAmount: paidVal,
        balanceDue: remainingVal,
        feeStatus: remainingVal === 0 ? 'Paid' : paidVal > 0 ? 'Partial' : 'Pending',
        paymentMode,
        source: 'Manual Entry',
        notes: notes.trim()
      };

      await enqueueOfflineRecord({
        record_id: targetId,
        updated_at: nowIso,
        entityType: 'student',
        action: 'UPSERT',
        payload: sheetPayload
      });

      if (typeof navigator !== 'undefined' && navigator.onLine) {
        sendCorsSafeAppsScriptRequest({
          action: 'sync_batch',
          records: [sheetPayload]
        }).catch(() => {});
      }

      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <DraggableWindow
      isOpen={isOpen}
      onClose={onClose}
      theme="dark"
      maxWidthClass="max-w-2xl"
      icon={
        <div className="p-2 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 shrink-0">
          <UserPlus className="w-5 h-5" />
        </div>
      }
      title={
        <span className="flex flex-wrap items-center gap-2 text-white">
          <span>+ Add Student / Lead Manually</span>
          <span className="px-2 py-0.5 text-[10px] font-mono rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
            0ms Instant Save + Auto Cloud Sync
          </span>
        </span>
      }
      subtitle={`Saves immediately to Offline Storage & pushes to ${PRIMARY_INSTITUTE_EMAIL} Master Sheet`}
    >
      <form onSubmit={handleSubmit} className="p-4 sm:p-6 space-y-4">
          {/* Entry Mode Toggle */}
          <div className="flex items-center justify-between gap-2 bg-slate-950 p-1.5 rounded-xl border border-slate-800">
            <button
              type="button"
              onClick={() => setEntryType('student')}
              className={`flex-1 py-2 px-3 rounded-lg text-xs font-extrabold transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                entryType === 'student'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Confirmed Student Admission</span>
            </button>
            <button
              type="button"
              onClick={() => setEntryType('lead')}
              className={`flex-1 py-2 px-3 rounded-lg text-xs font-extrabold transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                entryType === 'lead'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Course Inquiry / Lead CRM</span>
            </button>
          </div>

          {/* Real-Time Duplicate Check Warning Banner */}
          {duplicateMatch && (
            <div className="p-3.5 rounded-xl bg-amber-950/70 border border-amber-500/40 text-amber-200 flex items-start justify-between gap-3">
              <div className="flex items-start gap-2.5">
                <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                <div className="text-xs space-y-1">
                  <div className="font-black text-amber-300">
                    Existing student found: {duplicateMatch.name} ({duplicateMatch.regId})
                  </div>
                  <div className="text-amber-200/80">
                    Course: <strong>{duplicateMatch.course}</strong> • Phone: {duplicateMatch.phone} • Net Fee: ₹{duplicateMatch.netFee}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    if (onEditExistingStudent) {
                      onClose();
                      onEditExistingStudent(duplicateMatch);
                    } else {
                      setName(duplicateMatch.name);
                      setEmail(duplicateMatch.email || '');
                      setCourse(duplicateMatch.course);
                      setOverrideExisting(true);
                    }
                  }}
                  className="px-2.5 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-[11px] cursor-pointer"
                >
                  View or Update Instead
                </button>
              </div>
            </div>
          )}

          {errorMsg && (
            <div className="p-3 rounded-xl bg-rose-950/80 border border-rose-500/40 text-rose-200 text-xs font-bold flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Row 1: Name & Mobile */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1">
                Student Full Name <span className="text-rose-400">*</span>
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Rahul Deshmukh"
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white text-xs font-semibold focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1">
                Mobile Number (10-Digit) <span className="text-rose-400">*</span>
              </label>
              <div className="relative">
                <Phone className="w-3.5 h-3.5 text-slate-400 absolute left-3.5 top-3" />
                <input
                  type="tel"
                  required
                  value={mobile}
                  onChange={(e) => setMobile(e.target.value)}
                  placeholder="98230XXXXX"
                  maxLength={14}
                  className="w-full pl-9 pr-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white text-xs font-mono font-bold focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
              </div>
            </div>
          </div>

          {/* Row 2: Email & Language */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1">
                Email Address <span className="text-slate-500">(Optional)</span>
              </label>
              <div className="relative">
                <Mail className="w-3.5 h-3.5 text-slate-400 absolute left-3.5 top-3" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="student@gmail.com"
                  className="w-full pl-9 pr-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1">
                Preferred Language
              </label>
              <div className="relative">
                <Globe className="w-3.5 h-3.5 text-slate-400 absolute left-3.5 top-3" />
                <select
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                  className="w-full pl-9 pr-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white text-xs font-semibold focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                >
                  {LANGUAGE_PRESETS.map(lang => (
                    <option key={lang} value={lang}>{lang}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Row 3: Course, Branch, Batch */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1">
                Course Track
              </label>
              <div className="relative">
                <BookOpen className="w-3.5 h-3.5 text-indigo-400 absolute left-3 top-3" />
                <select
                  value={course}
                  onChange={(e) => handleCourseChange(e.target.value)}
                  className="w-full pl-8 pr-3 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white text-xs font-bold focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                >
                  {COURSE_PRESETS.map(c => (
                    <option key={c.name} value={c.name}>
                      {c.name} {c.name !== 'Custom' ? `(₹${c.defaultFee.toLocaleString('en-IN')})` : ''}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1">
                Campus Branch
              </label>
              <div className="relative">
                <MapPin className="w-3.5 h-3.5 text-emerald-400 absolute left-3 top-3" />
                <select
                  value={branch}
                  onChange={(e) => setBranch(e.target.value)}
                  className="w-full pl-8 pr-3 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white text-xs font-semibold focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                >
                  {BRANCH_PRESETS.map(b => (
                    <option key={b} value={b}>{b}</option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1">
                Preferred Batch
              </label>
              <div className="relative">
                <Clock className="w-3.5 h-3.5 text-amber-400 absolute left-3 top-3" />
                <select
                  value={batch}
                  onChange={(e) => setBatch(e.target.value)}
                  className="w-full pl-8 pr-3 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white text-xs font-semibold focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                >
                  {BATCH_PRESETS.map(bt => (
                    <option key={bt} value={bt}>{bt}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {course === 'Custom' && (
            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1">
                Custom Course Name
              </label>
              <input
                type="text"
                value={customCourseName}
                onChange={(e) => setCustomCourseName(e.target.value)}
                placeholder="Enter custom program title..."
                className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white text-xs"
              />
            </div>
          )}

          {/* Installments & Fee Tracker Box */}
          {entryType === 'student' && (
            <div className="p-4 rounded-2xl bg-slate-950/90 border border-slate-800 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-extrabold uppercase tracking-wider text-indigo-400 flex items-center gap-1.5">
                  <IndianRupee className="w-3.5 h-3.5" />
                  <span>Installments &amp; Fee Tracker</span>
                </span>
                <span className="text-[11px] font-mono text-slate-400">
                  Balance Due:{' '}
                  <strong className={balanceDue > 0 ? 'text-amber-400' : 'text-emerald-400'}>
                    ₹{balanceDue.toLocaleString('en-IN')}
                  </strong>
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-400 mb-1">
                    Total Course Fee (₹)
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={totalFee}
                    onChange={(e) => {
                      const val = Number(e.target.value) || 0;
                      setTotalFee(val);
                      if (feeStatus === 'Paid') setAmountPaid(val);
                    }}
                    className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white font-mono text-xs font-bold"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-400 mb-1">
                    Fee Status
                  </label>
                  <select
                    value={feeStatus}
                    onChange={(e) => handleFeeStatusChange(e.target.value as any)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white text-xs font-bold"
                  >
                    <option value="Paid">Paid</option>
                    <option value="Partial">Partial</option>
                    <option value="Pending">Pending</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-400 mb-1">
                    Amount Paid (₹)
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={totalFee}
                    value={amountPaid}
                    onChange={(e) => {
                      const paid = Number(e.target.value) || 0;
                      setAmountPaid(paid);
                      if (paid >= totalFee && totalFee > 0) setFeeStatus('Paid');
                      else if (paid > 0) setFeeStatus('Partial');
                      else setFeeStatus('Pending');
                    }}
                    className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-emerald-400 font-mono text-xs font-bold"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-400 mb-1">
                    Payment Mode
                  </label>
                  <select
                    value={paymentMode}
                    onChange={(e) => setPaymentMode(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white text-xs font-semibold"
                  >
                    {PAYMENT_MODES.map(pm => (
                      <option key={pm} value={pm}>{pm}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* Notes */}
          <div>
            <label className="block text-xs font-bold text-slate-300 mb-1">
              Counselor Remarks / Installment Notes <span className="text-slate-500">(Optional)</span>
            </label>
            <div className="relative">
              <FileText className="w-3.5 h-3.5 text-slate-400 absolute left-3.5 top-3" />
              <textarea
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Any installment commitment date, discount approval, or batch remarks..."
                className="w-full pl-9 pr-3.5 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              />
            </div>
          </div>

          {/* Footer Submit Controls */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between pt-3 border-t border-slate-800 gap-3">
            <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
              <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>Source tagged as <strong>Manual Entry</strong> • Auto-syncs to Google Sheets</span>
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
              <button
                type="button"
                onClick={onClose}
                className="min-h-[44px] sm:min-h-0 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="flex-1 sm:flex-none min-h-[44px] sm:min-h-0 px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-black shadow-lg shadow-emerald-600/20 flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <UserPlus className="w-4 h-4" />
                <span>
                  {isSubmitting
                    ? 'Saving & Syncing...'
                    : overrideExisting
                    ? 'Update Existing Record & Sync'
                    : entryType === 'lead'
                    ? 'Save Inquiry & Sync Now'
                    : 'Save Admission & Sync Now'}
                </span>
              </button>
            </div>
          </div>
        </form>
    </DraggableWindow>
  );
};

export default ManualEntryModal;
