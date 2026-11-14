/**
 * src/services/crmActions.ts
 * Unified CRM Data Factories, Strict Record Discrimination (`recordType`),
 * Deduplication Engine, and Boot Sanitizer for Manual UI Forms & Gemini AI Copilot.
 */

import { AppState, FeeMilestone, Lead, LeadStage, Student } from '../types';
import { LIVE_TODAY_ISO } from '../data/initialData';
import { getDeterministicLeadId, getDeterministicStudentId } from './firebase';

const DUMMY_PLACEHOLDER_PHONES = new Set(['9876543210', '0000000000', '1234567890', '9999999999']);

/**
 * Normalizes a phone string to a clean 10-digit Indian mobile number (stripping +91, spaces, dashes).
 * Returns '' if no valid 10-digit phone is present or if it matches a dummy placeholder.
 */
export function normalizeIndianPhone(rawPhone?: string | null, allowDummy = false): string {
  if (!rawPhone) return '';
  const digits = String(rawPhone).replace(/\D/g, '');
  const ten = digits.length >= 10 ? digits.slice(-10) : '';
  if (!ten || ten.length < 10) return '';
  if (!allowDummy && DUMMY_PLACEHOLDER_PHONES.has(ten)) return '';
  return ten;
}

/**
 * Formats a 10-digit phone with +91 prefix for WhatsApp/display when needed.
 */
export function formatWhatsAppPhone(rawPhone?: string | null): string {
  const ten = normalizeIndianPhone(rawPhone, true);
  return ten ? `+91${ten}` : '';
}

/**
 * Builds standard 2-part fee milestones for a given paid amount and net course fee.
 */
export function buildNormalizedMilestones(
  amountPaid: number,
  totalFees: number,
  paymentDate: string = LIVE_TODAY_ISO
): FeeMilestone[] {
  const safeNet = Math.max(0, Math.round(totalFees));
  const safePaid = Math.min(safeNet, Math.max(0, Math.round(amountPaid)));
  const balance = Math.max(0, safeNet - safePaid);
  const nextMonthIso = new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0];

  if (safePaid >= safeNet && safeNet > 0) {
    return [
      {
        name: 'Full Course Fee Settlement',
        amount: safeNet,
        dueDate: paymentDate,
        status: 'Paid',
        paymentDate,
        mode: 'UPI',
        ref: `UPI${String(Date.now()).slice(-8)}`
      }
    ];
  }

  if (safePaid > 0) {
    return [
      {
        name: 'Admission Token Deposit',
        amount: safePaid,
        dueDate: paymentDate,
        status: 'Paid',
        paymentDate,
        mode: 'UPI',
        ref: `UPI${String(Date.now()).slice(-8)}`
      },
      {
        name: 'Final Course Installment',
        amount: balance,
        dueDate: nextMonthIso,
        status: 'Pending',
        paymentDate: '',
        mode: 'UPI',
        ref: ''
      }
    ];
  }

  const firstHalf = Math.round(safeNet / 2);
  return [
    {
      name: 'Installment 1 (Admission Deposit)',
      amount: firstHalf,
      dueDate: paymentDate,
      status: 'Pending',
      paymentDate: '',
      mode: 'UPI',
      ref: ''
    },
    {
      name: 'Installment 2 (Final Balance)',
      amount: Math.max(0, safeNet - firstHalf),
      dueDate: nextMonthIso,
      status: 'Pending',
      paymentDate: '',
      mode: 'UPI',
      ref: ''
    }
  ];
}

export interface CreateInquiryInput {
  id?: string;
  leadId?: string;
  name: string;
  phone?: string;
  email?: string;
  locality?: string;
  branch?: string;
  course?: string;
  stage?: LeadStage | string;
  intent?: 'Hot' | 'Warm' | 'Cold';
  enquiryDate?: string;
  followUpDate?: string;
  followUpTime?: string;
  lastContact?: string;
  source?: string;
  mode?: string;
  staff?: string;
  objection?: string;
  notes?: string;
  isConverted?: boolean;
  convertedStudentId?: string;
}

/**
 * Shared Factory for Inquiries / Leads (`recordType: 'inquiry'`).
 * Used by BOTH the manual Lead Modal form and the Gemini AI `create_inquiry_lead` tool.
 * Guarantees `recordType: 'inquiry'`, `isConverted: false`, and strips any student-only fields.
 */
export function createNormalizedInquiry(
  input: CreateInquiryInput,
  state?: AppState
): Lead {
  const nowIso = new Date().toISOString();
  const cleanName =
    String(input.name || 'New Inquiry')
      .replace(/\b[6-9]\d{9}\b/g, '')
      .replace(/\b(?:interested\s+in|for\s+course|course)\b.*$/i, '')
      .trim() || 'New Inquiry';

  const cleanPhone = normalizeIndianPhone(input.phone, false);

  const rawCourseInput = String(input.course || '').trim();
  const matchedCourse = state?.courses?.find(
    c =>
      c.name.toLowerCase().includes(rawCourseInput.toLowerCase()) ||
      (rawCourseInput && rawCourseInput.toLowerCase().includes(c.name.toLowerCase()))
  );
  const courseName = matchedCourse
    ? matchedCourse.name
    : rawCourseInput || state?.courses?.[0]?.name || 'Complete Master Trader Blueprint';

  const validStages: LeadStage[] = [
    'New Enquiry',
    'Contacted',
    'Interested',
    'Demo Scheduled',
    'Demo Attended',
    'Follow-up Required',
    'Admission Confirmed',
    'Future Follow-up',
    'Not Interested',
    'Lost'
  ];

  const requestedStage = String(input.stage || 'New Enquiry').trim() as LeadStage;
  const stage: LeadStage = validStages.includes(requestedStage) ? requestedStage : 'New Enquiry';
  const isConverted = Boolean(input.isConverted) || stage === 'Admission Confirmed';

  const existingId = String(input.id || input.leadId || '').trim();
  const deterministicId = existingId
    ? existingId
    : cleanPhone
    ? getDeterministicLeadId(cleanPhone, undefined, cleanName)
    : `LEAD-${Date.now().toString().slice(-6)}-${Math.random().toString(36).slice(2, 5).toUpperCase()}`;

  const branchName =
    String(input.branch || input.locality || 'FC Road, Shivajinagar, Pune').trim() ||
    'FC Road, Shivajinagar, Pune';

  const inquiry: Lead = {
    id: deterministicId,
    leadId: deterministicId,
    recordType: 'inquiry',
    isConverted,
    ...(input.convertedStudentId ? { convertedStudentId: input.convertedStudentId } : {}),
    status: stage,
    name: cleanName,
    phone: cleanPhone,
    email: String(input.email || '').trim(),
    locality: branchName,
    branch: branchName,
    course: courseName,
    stage: isConverted ? 'Admission Confirmed' : stage,
    intent:
      input.intent === 'Warm' || input.intent === 'Cold' || input.intent === 'Hot'
        ? input.intent
        : 'Hot',
    enquiryDate: String(input.enquiryDate || LIVE_TODAY_ISO).trim(),
    followUpDate: String(input.followUpDate || LIVE_TODAY_ISO).trim(),
    followUpTime: String(input.followUpTime || '11:00 AM').trim(),
    lastContact: String(input.lastContact || LIVE_TODAY_ISO).trim(),
    source: String(input.source || 'AI Copilot').trim(),
    mode: String(input.mode || 'Offline Classroom').trim(),
    staff: String(input.staff || 'Prasad Sir').trim(),
    objection: String(input.objection || 'None').trim(),
    notes: String(input.notes || '').trim(),
    updatedAt: nowIso
  };

  return inquiry;
}

export interface CreateStudentInput {
  id?: string;
  regId?: string;
  studentId?: string;
  leadId?: string;
  name: string;
  phone?: string;
  whatsapp?: string;
  email?: string;
  address?: string;
  branch?: string;
  course?: string;
  batch?: string;
  enrollDate?: string;
  joinDate?: string;
  status?: Student['status'];
  source?: string;
  grossFee?: number;
  discount?: number;
  netFee?: number;
  totalFees?: number;
  feePaid?: number;
  amountPaid?: number;
  docs?: string;
  notes?: string;
  milestones?: FeeMilestone[];
}

/**
 * Shared Factory for Admitted Students (`recordType: 'student'`).
 * Used by BOTH the manual Student Admission form and the Gemini AI `admit_student` tool.
 */
export function createNormalizedStudent(
  input: CreateStudentInput,
  state?: AppState
): Student {
  const nowIso = new Date().toISOString();
  const cleanName = String(input.name || 'New Student').trim() || 'New Student';
  const cleanPhone = normalizeIndianPhone(input.phone, true);

  const rawCourseInput = String(input.course || '').trim();
  const matchedCourse = state?.courses?.find(
    c =>
      c.name.toLowerCase().includes(rawCourseInput.toLowerCase()) ||
      (rawCourseInput && rawCourseInput.toLowerCase().includes(c.name.toLowerCase()))
  );
  const courseName = matchedCourse
    ? matchedCourse.name
    : rawCourseInput || state?.courses?.[0]?.name || 'Complete Master Trader Blueprint';

  const defaultFee = matchedCourse ? matchedCourse.fee : 35000;
  const discountVal = Math.max(0, Number(input.discount || 0));
  const requestedTotal = Number(input.totalFees ?? input.netFee ?? input.grossFee ?? 0);
  const requestedPaid = Number(input.amountPaid ?? input.feePaid ?? -1);

  const milestonesProvided = Array.isArray(input.milestones) && input.milestones.length > 0;
  const paidFromMilestones = milestonesProvided
    ? input.milestones!.filter(m => m.status === 'Paid').reduce((s, m) => s + (Number(m.amount) || 0), 0)
    : 0;

  const netFee =
    requestedTotal > 0
      ? requestedTotal
      : requestedPaid > defaultFee
      ? requestedPaid
      : Math.max(0, defaultFee - discountVal);

  const grossFee = Math.max(netFee + discountVal, Number(input.grossFee || netFee));
  const amountPaid =
    requestedPaid >= 0
      ? requestedPaid
      : milestonesProvided
      ? paidFromMilestones
      : Math.round(netFee / 2);
  const balanceDue = Math.max(0, netFee - amountPaid);

  const yr = new Date().getFullYear();
  const nextNum = (state?.students?.length || 0) + 1;
  const regId = String(
    input.regId || input.studentId || `SSM-${yr}-${String(nextNum).padStart(3, '0')}`
  ).trim();

  const deterministicId = getDeterministicStudentId(cleanPhone, input.id, regId);
  const matchBatch =
    state?.batches?.find(b => b.course === courseName && b.status === 'Active') ||
    state?.batches?.[0];
  const assignedBatch = String(
    input.batch !== undefined ? input.batch : matchBatch ? matchBatch.code : 'OCT-MTB-01'
  ).trim();

  const enrollDate = String(input.enrollDate || LIVE_TODAY_ISO).trim();
  const branchName = String(input.branch || input.address || 'FC Road, Shivajinagar, Pune').trim();

  const milestones = milestonesProvided
    ? input.milestones!
    : buildNormalizedMilestones(amountPaid, netFee, enrollDate);

  const student: Student = {
    id: deterministicId,
    regId,
    studentId: regId,
    recordType: 'student',
    ...(input.leadId ? { leadId: input.leadId } : {}),
    name: cleanName,
    phone: cleanPhone,
    whatsapp: input.whatsapp || formatWhatsAppPhone(cleanPhone),
    email: String(input.email || '').trim(),
    address: branchName,
    branch: branchName,
    course: courseName,
    batch: assignedBatch,
    enrollDate,
    enrollmentDate: enrollDate,
    joinDate: String(input.joinDate || enrollDate).trim(),
    status: input.status || 'Active',
    source: String(input.source || 'Direct Admission').trim(),
    grossFee,
    discount: discountVal,
    netFee,
    totalFees: netFee,
    amountPaid,
    balanceDue,
    docs: String(input.docs || 'Verified Admission').trim(),
    notes: String(input.notes || '').trim(),
    milestones,
    updatedAt: nowIso
  };

  return student;
}

/**
 * Atomic Lead-to-Student Conversion Factory used by BOTH the UI "Convert to Student" button
 * and the Gemini AI `convert_lead_to_student` tool.
 */
export function convertInquiryToStudentAtomic(
  lead: Lead,
  options: {
    course?: string;
    batch?: string;
    feePaid?: number;
    totalFees?: number;
  },
  state: AppState
): { updatedLead: Lead; newStudent: Student } {
  const nowIso = new Date().toISOString();
  const courseName = String(options.course || lead.course || state.courses[0]?.name || 'Complete Master Trader Blueprint').trim();
  const matchedCourse =
    state.courses.find(
      c =>
        c.name.toLowerCase().includes(courseName.toLowerCase()) ||
        courseName.toLowerCase().includes(c.name.toLowerCase())
    ) || state.courses[0];
  const defaultFee = matchedCourse ? matchedCourse.fee : 35000;
  const totalFees =
    options.totalFees && options.totalFees > 0 ? options.totalFees : defaultFee;
  const amountPaid =
    options.feePaid !== undefined && options.feePaid !== null && !Number.isNaN(Number(options.feePaid)) && Number(options.feePaid) >= 0
      ? Number(options.feePaid)
      : Math.round(totalFees / 2);

  const newStudent = createNormalizedStudent(
    {
      leadId: lead.id,
      name: lead.name,
      phone: lead.phone,
      email: lead.email,
      address: lead.locality || lead.branch || 'Pune',
      branch: lead.branch || lead.locality || 'FC Road, Shivajinagar, Pune',
      course: courseName,
      batch: options.batch,
      totalFees: Math.max(totalFees, amountPaid),
      amountPaid,
      source: `Lead Conversion (${lead.source || 'CRM'})`,
      docs: `Converted from Lead ${lead.id}`,
      notes: lead.notes || `Converted from Inquiry ${lead.id}`
    },
    state
  );

  const updatedLead: Lead = {
    ...lead,
    recordType: 'inquiry',
    leadId: lead.leadId || lead.id,
    isConverted: true,
    convertedStudentId: newStudent.id,
    stage: 'Admission Confirmed',
    status: 'Admission Confirmed',
    course: courseName,
    lastContact: LIVE_TODAY_ISO,
    updatedAt: nowIso
  };

  return { updatedLead, newStudent };
}

/**
 * Checks whether a Lead/Inquiry has ACTUALLY been converted to an enrolled student.
 * Strictly requires `lead.isConverted === true` or `lead.stage === 'Admission Confirmed'`
 * or an explicit `leadId` link on a student record — preventing un-converted AI inquiries
 * from falsely displaying "View Student" / "Student Details" buttons.
 */
export function findConvertedStudentForInquiry(
  lead: Lead,
  students: Student[]
): Student | undefined {
  if (!lead) return undefined;

  // If the record is explicitly an un-converted inquiry, only match if a student explicitly references this leadId
  const explicitMatch = students.find(
    s =>
      (s.leadId && s.leadId === lead.id) ||
      (lead.convertedStudentId && s.id === lead.convertedStudentId) ||
      (s.docs && s.docs.includes(`Lead ${lead.id}`))
  );
  if (explicitMatch) return explicitMatch;

  // If the lead is not marked converted and stage is not Admission Confirmed, it is NOT converted
  if (lead.isConverted === false && lead.stage !== 'Admission Confirmed') {
    return undefined;
  }

  if (lead.stage === 'Admission Confirmed' || lead.isConverted === true) {
    const cleanLeadPhone = normalizeIndianPhone(lead.phone, false);
    if (cleanLeadPhone) {
      const byPhone = students.find(
        s => normalizeIndianPhone(s.phone, false) === cleanLeadPhone
      );
      if (byPhone) return byPhone;
    }
    const cleanName = (lead.name || '').trim().toLowerCase();
    if (cleanName) {
      return students.find(s => (s.name || '').trim().toLowerCase() === cleanName);
    }
  }

  return undefined;
}

/**
 * Duplicate Detection Before AI Creation:
 * Checks if a person with the same 10-digit phone or exact full name already exists in `leads` or `students`.
 */
export function findExistingDuplicateRecord(
  name: string,
  phone: string | undefined,
  state: AppState
): { matchedType: 'inquiry' | 'student'; record: Lead | Student } | null {
  const cleanPhone = normalizeIndianPhone(phone, false);
  const cleanName = String(name || '').trim().toLowerCase();

  if (cleanPhone) {
    const existingStuByPhone = (state.students || []).find(
      s => normalizeIndianPhone(s.phone, false) === cleanPhone && s.status !== 'Archived'
    );
    if (existingStuByPhone) {
      return { matchedType: 'student', record: existingStuByPhone };
    }
    const existingLeadByPhone = (state.leads || []).find(
      l => normalizeIndianPhone(l.phone, false) === cleanPhone
    );
    if (existingLeadByPhone) {
      return { matchedType: 'inquiry', record: existingLeadByPhone };
    }
  }

  if (cleanName && cleanName.length >= 3 && !['new inquiry', 'new student', 'new lead'].includes(cleanName)) {
    const existingStuByName = (state.students || []).find(
      s => (s.name || '').trim().toLowerCase() === cleanName && s.status !== 'Archived'
    );
    if (existingStuByName) {
      return { matchedType: 'student', record: existingStuByName };
    }
    const existingLeadByName = (state.leads || []).find(
      l => (l.name || '').trim().toLowerCase() === cleanName
    );
    if (existingLeadByName) {
      return { matchedType: 'inquiry', record: existingLeadByName };
    }
  }

  return null;
}

/**
 * Automatic Boot Data Sanitizer:
 * Scans existing `leads` / `inquiries` records created previously by the AI chatbot,
 * strips accidental student-only flags or dummy colliding phones ('9876543210'),
 * enforces `recordType: 'inquiry'` and `isConverted: false` (unless converted),
 * and ensures all `students` have `recordType: 'student'`.
 */
export function sanitizeCrmStateOnBoot(state: AppState): {
  sanitizedState: AppState;
  fixedCount: number;
} {
  let fixedCount = 0;

  const rawStudents = Array.isArray(state.students) ? state.students : [];
  const rawLeads = Array.isArray(state.leads) ? state.leads : [];

  const sanitizedStudents: Student[] = rawStudents.map(s => {
    const paid = (s.milestones || [])
      .filter(m => m.status === 'Paid')
      .reduce((sum, m) => sum + (Number(m.amount) || 0), 0);
    const total = Number(s.netFee || s.totalFees || 35000);
    const balance = Math.max(0, total - paid);
    if (s.recordType !== 'student' || !s.studentId) {
      fixedCount++;
    }
    return {
      ...s,
      recordType: 'student',
      studentId: s.studentId || s.regId || s.id,
      enrollmentDate: s.enrollmentDate || s.enrollDate || LIVE_TODAY_ISO,
      totalFees: total,
      amountPaid: paid,
      balanceDue: balance
    };
  });

  const sanitizedLeads: Lead[] = rawLeads.map(l => {
    const rawAny = l as any;
    const hasExplicitStudentLink = sanitizedStudents.some(
      s => (s.leadId && s.leadId === l.id) || (s.docs && s.docs.includes(`Lead ${l.id}`))
    );
    const isTrulyConverted = l.stage === 'Admission Confirmed' || hasExplicitStudentLink;

    // Strip any accidental student-only fields that might have been attached to a lead object
    const cleanedLead: any = { ...rawAny };
    delete cleanedLead.regId;
    delete cleanedLead.studentId;
    delete cleanedLead.milestones;
    delete cleanedLead.grossFee;
    delete cleanedLead.netFee;
    delete cleanedLead.feePaid;
    delete cleanedLead.paidAmount;
    delete cleanedLead.totalFees;
    delete cleanedLead.amountPaid;
    delete cleanedLead.balanceDue;
    delete cleanedLead.enrollDate;
    delete cleanedLead.enrollmentDate;

    // Strip dummy default phone '9876543210' on AI-created leads so they don't collide with enrolled students
    let safePhone = String(l.phone || '').trim();
    const digits = safePhone.replace(/\D/g, '').slice(-10);
    if (
      DUMMY_PLACEHOLDER_PHONES.has(digits) &&
      !isTrulyConverted &&
      (String(l.source || '').toLowerCase().includes('ai') ||
        String(l.notes || '').toLowerCase().includes('ai'))
    ) {
      safePhone = '';
      fixedCount++;
    }

    if (
      l.recordType !== 'inquiry' ||
      l.isConverted !== isTrulyConverted ||
      rawAny.regId !== undefined ||
      rawAny.milestones !== undefined
    ) {
      fixedCount++;
    }

    return {
      ...(cleanedLead as Lead),
      id: l.id || `LEAD-${Date.now()}`,
      leadId: l.leadId || l.id,
      recordType: 'inquiry',
      isConverted: isTrulyConverted,
      status: l.stage || 'New Enquiry',
      phone: safePhone,
      branch: l.branch || l.locality || 'FC Road, Shivajinagar, Pune'
    };
  });

  return {
    sanitizedState: {
      ...state,
      students: sanitizedStudents,
      leads: sanitizedLeads
    },
    fixedCount
  };
}
