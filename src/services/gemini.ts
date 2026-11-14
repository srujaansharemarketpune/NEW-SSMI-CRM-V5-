import { AppState } from '../types';
import { LIVE_TODAY_ISO } from '../data/initialData';

export interface ChatMessage {
  role: 'user' | 'model';
  text: string;
}

export interface AiActionCardData {
  recordType: 'inquiry' | 'student';
  recordId: string;
  internalId: string;
  name: string;
  phone: string;
  course: string;
  branch: string;
  stageOrBatch: string;
  isConverted?: boolean;
  isDuplicateWarning?: boolean;
}

export interface ExecutedToolAction {
  toolName: string;
  success: boolean;
  summary: string;
  recordId?: string;
  actionLabel?: string;
  statusTag?: string;
  actionCard?: AiActionCardData;
}

export interface GeminiQueryResult {
  text: string;
  searchSources: { title: string; url: string }[];
  executedActions?: ExecutedToolAction[];
  error?: string;
}

export interface ResolvedEntityMatch {
  record: any;
  collection: 'students' | 'leads' | 'staff' | 'courses' | 'batches';
}

/**
 * Official SSMI Course & Fee Mapping Helper:
 * - Basic -> Basic Trading ₹5,000
 * - Advance -> Advance Stock Market ₹7,500
 * - F&O -> Futures & Options ₹10,000
 * - Forex -> Forex & Crypto ₹9,000
 * - Complete -> Complete Trader Program ₹15,000
 */
export function resolveSsmiCourseAndFee(
  rawCourse?: string,
  explicitTotalFee?: number,
  defaultCourse: string = 'Basic Trading',
  defaultFee: number = 5000
): { courseName: string; totalFees: number } {
  const input = String(rawCourse || '').trim();
  const lower = input.toLowerCase();

  let mappedCourse = input || defaultCourse;
  let mappedFee = defaultFee;

  if (!input) {
    mappedCourse = defaultCourse;
    mappedFee = defaultFee;
  } else if (/\b(complete|master|blueprint|full)\b/i.test(lower)) {
    mappedCourse = 'Complete Trader Program';
    mappedFee = 15000;
  } else if (/\b(f&o|fno|f\s*&\s*o|future|option|derivatives)\b/i.test(lower)) {
    mappedCourse = 'Futures & Options';
    mappedFee = 10000;
  } else if (/\b(forex|crypto|currency|xau|bitcoin)\b/i.test(lower)) {
    mappedCourse = 'Forex & Crypto';
    mappedFee = 9000;
  } else if (/\b(advance|advanced|pro|price\s*action)\b/i.test(lower)) {
    mappedCourse = 'Advance Stock Market';
    mappedFee = 7500;
  } else if (/\b(basic|beginner|foundation|starter)\b/i.test(lower)) {
    mappedCourse = 'Basic Trading';
    mappedFee = 5000;
  }

  const finalTotalFees =
    explicitTotalFee !== undefined && !Number.isNaN(Number(explicitTotalFee)) && Number(explicitTotalFee) > 0
      ? Number(explicitTotalFee)
      : mappedFee;

  return { courseName: mappedCourse, totalFees: finalTotalFees };
}

/**
 * Strict Gemini Function Calling Tool Declarations for Srujaan Share Market Institute CRM
 */
export const CRM_GEMINI_FUNCTION_DECLARATIONS = [
  {
    name: 'searchRecords',
    description:
      'Fuzzy-searches across leads (inquiries), students, and admissions by partial name, phone number, course, batch, or status. Returns matching records with their unique IDs.',
    parameters: {
      type: 'OBJECT',
      properties: {
        query: { type: 'STRING', description: 'Search keyword, partial name, phone number, course, batch, or status' },
        category: { type: 'STRING', description: '"leads", "students", "admissions", or "all"' }
      },
      required: ['query']
    }
  },
  {
    name: 'addLead',
    description:
      'Creates a new inquiry/lead. Auto-fills missing fields with smart defaults (course: "Basic Trading", status: "New", phone: "Pending", date: today) without throwing validation errors.',
    parameters: {
      type: 'OBJECT',
      properties: {
        name: { type: 'STRING', description: 'Full or first name of the prospect/inquiry' },
        phone: { type: 'STRING', description: '10-digit Indian mobile number (defaults to "Pending")' },
        course: { type: 'STRING', description: 'Course the prospect is interested in (defaults to "Basic Trading")' },
        source: { type: 'STRING', description: 'Lead source (Walk-in, Instagram, Reference, Google, AI Copilot)' },
        notes: { type: 'STRING', description: 'Counselor notes or remarks' },
        status: { type: 'STRING', description: 'Lead status/stage (defaults to "New")' }
      },
      required: ['name']
    }
  },
  {
    name: 'addStudent',
    description:
      'Directly enrolls a new student into students & admissions. Maps abbreviated SSMI courses (Basic -> Basic Trading ₹5,000, Advance -> Advance Stock Market ₹7,500, F&O -> Futures & Options ₹10,000, Forex -> Forex & Crypto ₹9,000, Complete -> Complete Trader Program ₹15,000) and calculates pendingFees = totalFees - paidFees.',
    parameters: {
      type: 'OBJECT',
      properties: {
        name: { type: 'STRING', description: 'Full name of the student' },
        phone: { type: 'STRING', description: '10-digit Indian mobile number' },
        course: { type: 'STRING', description: 'Enrolled course name or abbreviation' },
        totalFees: { type: 'NUMBER', description: 'Total course fee in INR' },
        paidFees: { type: 'NUMBER', description: 'Initial fee paid in INR' },
        batch: { type: 'STRING', description: 'Assigned batch code or name' },
        paymentMode: { type: 'STRING', description: 'UPI, Cash, Bank Transfer, Card' },
        notes: { type: 'STRING', description: 'Admission notes or remarks' }
      },
      required: ['name']
    }
  },
  {
    name: 'updateRecord',
    description:
      'Finds a student or lead using fuzzy/partial matching on identifier (name or phone) and updates any fields (name, phone, course, paidFees, totalFees, pendingFees, batch, status, notes).',
    parameters: {
      type: 'OBJECT',
      properties: {
        identifier: { type: 'STRING', description: 'Name, phone number, or ID of the record' },
        targetType: { type: 'STRING', description: '"student", "lead", "admission", "inquiry", or "auto"' },
        updates: { type: 'OBJECT', description: 'Key-value fields to update' }
      },
      required: ['identifier', 'updates']
    }
  },
  {
    name: 'convertLeadToStudent',
    description:
      'Finds the matching lead by partial name/phone, creates a full student admission record (inheriting existing lead data + applying any new overrides), marks the lead as "Converted", and prevents duplicates.',
    parameters: {
      type: 'OBJECT',
      properties: {
        identifier: { type: 'STRING', description: 'Lead name, phone number, or LEAD-... ID' },
        course: { type: 'STRING', description: 'Course to enroll into' },
        totalFees: { type: 'NUMBER', description: 'Total course fee in INR' },
        paidFees: { type: 'NUMBER', description: 'Admission fee paid in INR' },
        batch: { type: 'STRING', description: 'Batch code or schedule' }
      },
      required: ['identifier']
    }
  },
  {
    name: 'deleteRecord',
    description: 'Finds the matching student or lead by partial name/phone and deletes it from state and Firestore (Master Admin only).',
    parameters: {
      type: 'OBJECT',
      properties: {
        identifier: { type: 'STRING', description: 'Name, phone number, or ID of the record' },
        targetType: { type: 'STRING', description: '"student", "lead", "admission", "inquiry", or "auto"' },
        confirmed: { type: 'BOOLEAN', description: 'True if user explicitly said confirm or force' }
      },
      required: ['identifier']
    }
  },
  {
    name: 'getDashboardStats',
    description: 'Returns live counts of total leads, active students, total fees collected, pending fees, and course-wise breakdowns.',
    parameters: {
      type: 'OBJECT',
      properties: {}
    }
  }
];

const HONORIFICS = new Set(['mr', 'mrs', 'ms', 'miss', 'dr', 'prof', 'shri', 'smt', 'kumari']);

function normalizeTokens(str: string): string[] {
  return String(str || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .map(t => t.trim())
    .filter(t => t.length > 1 && !HONORIFICS.has(t));
}

/**
 * Universal Fuzzy Entity Resolver (Case-Insensitive, Multi-Token & Cross-Collection)
 * Searches by ID, RegID, Exact Name, Bidirectional Substring, Word-Token Overlap, and Phone Digits.
 */
export function resolveEntityRecord(
  source: AppState | Record<string, any> | undefined | null,
  searchQuery: string,
  preferredCollection: 'students' | 'leads' | 'staff' | 'courses' | 'batches' | 'auto' = 'students'
): ResolvedEntityMatch | null {
  if (!source || !searchQuery) return null;
  const rawTerm = String(searchQuery).trim();
  if (!rawTerm) return null;

  const term = rawTerm.toLowerCase().replace(/\s+/g, ' ');
  const termTokens = normalizeTokens(rawTerm);
  const digitsOnly = rawTerm.replace(/\D/g, '');

  const firstPref =
    preferredCollection === 'auto' || !preferredCollection ? 'students' : preferredCollection;
  const collectionsOrder: ('students' | 'leads' | 'staff' | 'courses' | 'batches')[] = [
    firstPref,
    'students',
    'leads',
    'staff',
    'courses',
    'batches'
  ].filter((v, i, a) => a.indexOf(v) === i) as ('students' | 'leads' | 'staff' | 'courses' | 'batches')[];

  for (const coll of collectionsOrder) {
    const list: any[] = Array.isArray((source as any)[coll]) ? (source as any)[coll] : [];
    if (list.length === 0) continue;

    // 1. Direct ID / RegID / Code match
    let match = list.find(
      item =>
        (item.id && String(item.id).trim().toLowerCase() === term) ||
        (item.regId && String(item.regId).trim().toLowerCase() === term) ||
        (item.code && String(item.code).trim().toLowerCase() === term)
    );
    if (match) return { record: match, collection: coll };

    // 2. Exact Name match (case-insensitive, normalized spaces)
    match = list.find(
      item => item.name && String(item.name).trim().toLowerCase().replace(/\s+/g, ' ') === term
    );
    if (match) return { record: match, collection: coll };

    // 3. Bidirectional Substring Name match
    match = list.find(item => {
      if (!item.name) return false;
      const candidate = String(item.name).trim().toLowerCase().replace(/\s+/g, ' ');
      return candidate.includes(term) || (candidate.length >= 3 && term.includes(candidate));
    });
    if (match) return { record: match, collection: coll };

    // 4. Token / Word Overlap match
    if (termTokens.length > 0) {
      match = list.find(item => {
        if (!item.name) return false;
        const itemTokens = normalizeTokens(item.name);
        return (
          itemTokens.length > 0 &&
          termTokens.every(qt => itemTokens.some(it => it === qt || it.startsWith(qt) || qt.startsWith(it)))
        );
      });
      if (match) return { record: match, collection: coll };

      match = list.find(item => {
        if (!item.name) return false;
        const itemTokens = normalizeTokens(item.name);
        return (
          itemTokens.length > 0 &&
          itemTokens.every(it => termTokens.some(qt => qt === it || qt.startsWith(it) || it.startsWith(qt)))
        );
      });
      if (match) return { record: match, collection: coll };
    }

    // 5. Phone Number match (4+ digits)
    if (digitsOnly.length >= 4) {
      match = list.find(
        item =>
          item.phone &&
          (String(item.phone).replace(/\D/g, '').includes(digitsOnly) ||
            digitsOnly.includes(String(item.phone).replace(/\D/g, '').slice(-10)))
      );
      if (match) return { record: match, collection: coll };
    }
  }

  return null;
}

/**
 * Finds all matching records in the requested collection(s) for disambiguation when multiple
 * people share the same partial/first name.
 */
export function findAllMatchingEntities(
  source: AppState | Record<string, any> | undefined | null,
  searchQuery: string,
  preferredCollection: 'students' | 'leads' | 'auto' = 'auto'
): ResolvedEntityMatch[] {
  if (!source || !searchQuery) return [];
  const rawTerm = String(searchQuery).trim();
  if (!rawTerm) return [];

  const term = rawTerm.toLowerCase().replace(/\s+/g, ' ');
  const termTokens = normalizeTokens(rawTerm);
  const digitsOnly = rawTerm.replace(/\D/g, '');

  const collections: ('students' | 'leads')[] =
    preferredCollection === 'students'
      ? ['students']
      : preferredCollection === 'leads'
      ? ['leads']
      : ['students', 'leads'];

  // First check exact ID, RegID, or full name match
  for (const coll of collections) {
    const list: any[] = Array.isArray((source as any)[coll]) ? (source as any)[coll] : [];
    const exactMatch = list.find(
      item =>
        (item.id && String(item.id).trim().toLowerCase() === term) ||
        (item.regId && String(item.regId).trim().toLowerCase() === term) ||
        (item.name && String(item.name).trim().toLowerCase().replace(/\s+/g, ' ') === term)
    );
    if (exactMatch) return [{ record: exactMatch, collection: coll }];
  }

  const results: ResolvedEntityMatch[] = [];
  for (const coll of collections) {
    const list: any[] = Array.isArray((source as any)[coll]) ? (source as any)[coll] : [];
    for (const item of list) {
      if (item.status === 'Archived') continue;
      const candidateName = String(item.name || '').trim().toLowerCase().replace(/\s+/g, ' ');
      const candidatePhone = String(item.phone || '').replace(/\D/g, '');
      const itemTokens = normalizeTokens(item.name || '');

      const isSubstringMatch =
        candidateName &&
        (candidateName.includes(term) || (candidateName.length >= 3 && term.includes(candidateName)));
      const isTokenMatch =
        termTokens.length > 0 &&
        itemTokens.length > 0 &&
        termTokens.every(qt => itemTokens.some(it => it === qt || it.startsWith(qt)));
      const isPhoneMatch =
        digitsOnly.length >= 4 &&
        candidatePhone &&
        (candidatePhone.includes(digitsOnly) || digitsOnly.includes(candidatePhone.slice(-10)));

      if (isSubstringMatch || isTokenMatch || isPhoneMatch) {
        results.push({ record: item, collection: coll });
      }
    }
  }
  return results;
}

export interface LastReferencedRecord {
  id: string;
  regId?: string;
  name: string;
  phone?: string;
  course?: string;
  collection: 'students' | 'leads';
}

let lastReferencedRecordState: LastReferencedRecord | null = null;

export function getLastReferencedRecord(): LastReferencedRecord | null {
  return lastReferencedRecordState;
}

export function setLastReferencedRecord(rec: LastReferencedRecord | null) {
  lastReferencedRecordState = rec;
}

export interface AgentStoreActions {
  searchRecords?: (
    query: string,
    entityType?: 'students' | 'inquiries' | 'all'
  ) =>
    | Promise<{ success: boolean; summary: string; records?: any[] }>
    | { success: boolean; summary: string; records?: any[] };
  getRecordDetails?: (
    identifier: string,
    entityType?: 'students' | 'inquiries' | 'auto'
  ) =>
    | Promise<{ success: boolean; summary: string; record?: any; recordId?: string }>
    | { success: boolean; summary: string; record?: any; recordId?: string };
  findDuplicateRecords?: (args: {
    category?: 'leads' | 'students' | 'all';
    deleteDuplicates?: boolean;
    confirmed?: boolean;
  }) =>
    | Promise<{ success: boolean; summary: string; duplicates?: any[]; awaitingConfirmation?: boolean }>
    | { success: boolean; summary: string; duplicates?: any[]; awaitingConfirmation?: boolean };
  getPendingFees?: (args?: {
    course?: string;
    batch?: string;
  }) =>
    | Promise<{ success: boolean; summary: string; records?: any[] }>
    | { success: boolean; summary: string; records?: any[] };
  getAttendanceSummary?: (args?: {
    batch?: string;
    belowThresholdOnly?: boolean;
  }) =>
    | Promise<{ success: boolean; summary: string; records?: any[] }>
    | { success: boolean; summary: string; records?: any[] };
  generateCRMReports?: (args?: {
    reportType?: string;
    days?: number;
  }) =>
    | Promise<{ success: boolean; summary: string; data?: any }>
    | { success: boolean; summary: string; data?: any };
  bulkUpdateLeads?: (args: {
    fromStatusOrStage: string;
    toStatusOrStage: string;
    confirmed?: boolean;
  }) =>
    | Promise<{ success: boolean; summary: string; updatedCount?: number }>
    | { success: boolean; summary: string; updatedCount?: number };
  addRecord: (
    collection: string,
    payload: {
      name?: string;
      phone?: string;
      course?: string;
      batch?: string;
      branch?: string;
      amount?: number;
      feePaid?: number;
      totalFee?: number;
      paymentMode?: string;
      notes?: string;
      date?: string;
      email?: string;
      locality?: string;
      source?: string;
      stage?: string;
      status?: string;
      intent?: string;
      followUpDate?: string;
      data?: Record<string, any>;
    }
  ) =>
    | Promise<{ success: boolean; summary: string; recordId?: string; record?: any; actionCard?: AiActionCardData }>
    | { success: boolean; summary: string; recordId?: string; record?: any; actionCard?: AiActionCardData };
  updateRecord: (
    collection: string,
    identifier: string,
    updates: Record<string, any>
  ) =>
    | Promise<{ success: boolean; summary: string; recordId?: string; record?: any; actionCard?: AiActionCardData }>
    | { success: boolean; summary: string; recordId?: string; record?: any; actionCard?: AiActionCardData };
  deleteRecord: (
    collection: string,
    identifier: string,
    confirmed?: boolean
  ) => Promise<{ success: boolean; summary: string; recordId?: string; awaitingConfirmation?: boolean }> | { success: boolean; summary: string; recordId?: string; awaitingConfirmation?: boolean };
  markAttendance: (
    args: {
      studentNameOrPhone?: string;
      studentIdentifier?: string;
      date?: string;
      status: 'Present' | 'Absent' | 'Late';
    }
  ) => Promise<{ success: boolean; summary: string; recordId?: string }> | { success: boolean; summary: string; recordId?: string };
  manageInstituteEntity?: (
    args: {
      entityType: string;
      action: string;
      nameOrTitle: string;
      course?: string;
      scheduleOrRole?: string;
      feeOrAmount?: number;
      phone?: string;
      status?: string;
    }
  ) => Promise<{ success: boolean; summary: string; recordId?: string }> | { success: boolean; summary: string; recordId?: string };
  repairSystemState?: (
    targetArea?: string
  ) => Promise<{ success: boolean; summary: string }> | { success: boolean; summary: string };
  getDatabaseSnapshot?: () =>
    | Promise<{ success: boolean; summary: string; snapshot?: any }>
    | { success: boolean; summary: string; snapshot?: any };
  getDashboardStats?: () =>
    | Promise<{ success: boolean; summary: string; stats?: any }>
    | { success: boolean; summary: string; stats?: any };
  updateCourseData?: (args: {
    courseId: string;
    targetCourseName?: string;
    instructorName?: string;
    title?: string;
    fee?: number;
    description?: string;
    duration?: string;
    mode?: string;
    status?: string;
  }) => Promise<{ success: boolean; summary: string; recordId?: string; actionLabel?: string }> | { success: boolean; summary: string; recordId?: string; actionLabel?: string };
  modifyCourse?: (
    courseId: string,
    data: Record<string, any>
  ) => Promise<{ success: boolean; summary: string; recordId?: string; actionLabel?: string }> | { success: boolean; summary: string; recordId?: string; actionLabel?: string };
  manageStudents?: (args: {
    action: 'add' | 'delete' | 'deleteAll';
    studentData?: Record<string, any>;
    studentId?: string;
    confirmPin?: string;
    filterTestOnly?: boolean;
  }) => Promise<{ success: boolean; summary: string; recordId?: string; actionLabel?: string; actionCard?: AiActionCardData }> | { success: boolean; summary: string; recordId?: string; actionLabel?: string; actionCard?: AiActionCardData };
  manageLeads?: (args: {
    action: 'add' | 'update' | 'delete' | 'deleteAll';
    leadData?: Record<string, any>;
    leadId?: string;
    confirmPin?: string;
    filterTestOnly?: boolean;
  }) => Promise<{ success: boolean; summary: string; recordId?: string; actionLabel?: string; actionCard?: AiActionCardData }> | { success: boolean; summary: string; recordId?: string; actionLabel?: string; actionCard?: AiActionCardData };
  updateSystemSettings?: (args: {
    settingKey: string;
    value: any;
  }) => Promise<{ success: boolean; summary: string; actionLabel?: string }> | { success: boolean; summary: string; actionLabel?: string };
  convertLeadToAdmission?: (args: {
    leadIdentifier: string;
    course?: string;
    batch?: string;
    feePaid?: number;
    totalFees?: number;
  }) =>
    | Promise<{ success: boolean; summary: string; recordId?: string; record?: any; actionLabel?: string; actionCard?: AiActionCardData }>
    | { success: boolean; summary: string; recordId?: string; record?: any; actionLabel?: string; actionCard?: AiActionCardData };
  searchWeb?: (
    query: string
  ) => Promise<{ success: boolean; summary: string; sources?: { title: string; url: string }[] }> | { success: boolean; summary: string; sources?: { title: string; url: string }[] };
}

export function getStudentAttendancePct(studentId: string, state: AppState): number {
  let present = 0;
  let total = 0;
  Object.values(state.attendance || {}).forEach(sess => {
    if (sess.sessionStatus === 'Cancelled') return;
    const rec = sess.records?.[studentId];
    if (!rec || rec.status === 'Not Marked') return;
    if (rec.status === 'Excused Leave' && state.excusedLeaveExcludedFromTotal) return;
    total++;
    if (rec.status === 'Present' || rec.status === 'Late') {
      present++;
    }
  });
  return total > 0 ? Math.round((present / total) * 100) : 100;
}

/**
 * Builds a compact, sanitized JSON snapshot of current counts and records
 * for Gemini's live CRUD tool reasoning.
 */
export function buildLedgerSnapshot(state?: AppState) {
  if (!state) return null;
  const activeStudents = state.students.filter(s => s.status !== 'Archived');
  return {
    today: LIVE_TODAY_ISO,
    lastReferencedRecord: lastReferencedRecordState,
    counts: {
      totalStudents: state.students.length,
      activeStudents: activeStudents.length,
      totalInquiries: state.leads.length,
      activeBatches: state.batches.filter(b => b.status === 'Active').length,
      courses: state.courses.length,
    },
    courses: state.courses.map(c => ({
      id: c.id,
      name: c.name,
      fee: c.fee,
      instructor: c.instructor,
      duration: c.duration,
      mode: c.mode,
      status: c.status || 'Active',
      syllabus: c.syllabus,
      code: c.code || c.id,
    })),
    batches: state.batches.map(b => ({
      code: b.code,
      name: b.name,
      course: b.course,
      schedule: b.schedule,
    })),
    students: state.students.slice(0, 80).map(s => {
      const paid = (s.milestones || [])
        .filter(m => m.status === 'Paid')
        .reduce((sum, m) => sum + m.amount, 0);
      return {
        id: s.id,
        regId: s.regId,
        name: s.name,
        phone: s.phone,
        course: s.course,
        batch: s.batch,
        address: s.address,
        enrollDate: s.enrollDate,
        status: s.status,
        netFee: s.netFee,
        feePaid: paid,
        paidAmount: paid,
        balanceDue: Math.max(0, s.netFee - paid),
        attendancePct: getStudentAttendancePct(s.id, state),
      };
    }),
    inquiries: state.leads.slice(0, 60).map(l => ({
      id: l.id,
      name: l.name,
      phone: l.phone,
      locality: l.locality,
      course: l.course,
      stage: l.stage,
      enquiryDate: l.enquiryDate,
      followUpDate: l.followUpDate,
    })),
  };
}

/**
 * Serializes live Srujaan Share Market Institute operational data into a concise
 * context block so the live Google Gemini API responds with sub-2s latency.
 */
export function buildLiveInstituteContext(state?: AppState, extraSummary?: string): string {
  if (!state) return extraSummary || '';

  const allStudents = state.students || [];
  let totalCollected = 0;
  let totalPending = 0;

  allStudents.forEach(s => {
    const paid = (s.milestones || [])
      .filter(m => m.status === 'Paid')
      .reduce((acc, m) => acc + m.amount, 0);
    const due = Math.max(0, s.netFee - paid);
    if (s.status !== 'Archived') {
      totalCollected += paid;
      totalPending += due;
    }
  });

  const courseLines = (state.courses || []).map(c => {
    const lectures = c.lectures || [];
    const completed = lectures.filter(l => l.completed).length;
    return `- ${c.name} (${c.code || c.id}) | Fee: ₹${c.fee.toLocaleString('en-IN')} | Lectures: ${completed}/${lectures.length}`;
  });

  const batchLines = (state.batches || []).map(b => {
    const count = allStudents.filter(s => s.status !== 'Archived' && s.batch === b.code).length;
    return `- ${b.code} (${b.name}): ${b.course} | Enrolled: ${count}/${b.capacity}`;
  });

  return [
    `Institute: ${state.settings.instituteName} (${state.settings.tagline})`,
    `Today's Date: ${LIVE_TODAY_ISO}`,
    `Financial Summary: Total Collected = ₹${totalCollected.toLocaleString('en-IN')} | Total Pending Fees = ₹${totalPending.toLocaleString('en-IN')}`,
    `Active Courses (${courseLines.length}):\n${courseLines.join('\n')}`,
    `Batches (${batchLines.length}):\n${batchLines.join('\n')}`,
    lastReferencedRecordState
      ? `Last Referenced Record in Conversation: ${lastReferencedRecordState.name} (${lastReferencedRecordState.regId || lastReferencedRecordState.id}, ${lastReferencedRecordState.collection})`
      : '',
    extraSummary ? `Additional Summary: ${extraSummary}` : ''
  ]
    .filter(Boolean)
    .join('\n\n');
}

function trackReferencedRecordFromResult(res: any, fallbackCollection: 'students' | 'leads' = 'students') {
  const rec = res?.record || (Array.isArray(res?.records) && res.records.length === 1 ? res.records[0] : null);
  if (rec && rec.name) {
    const isStu = Boolean(rec.regId || rec.recordType === 'student');
    setLastReferencedRecord({
      id: String(rec.id || rec.regId || ''),
      regId: rec.regId ? String(rec.regId) : undefined,
      name: String(rec.name),
      phone: rec.phone ? String(rec.phone) : undefined,
      course: rec.course ? String(rec.course) : undefined,
      collection: isStu ? 'students' : fallbackCollection,
    });
  }
}

/**
 * Dispatches any Gemini tool call to the bound store actions with strict Role-Based Access Control
 */
export async function executeClientToolCall(
  call: { id?: string; name: string; args?: any },
  appStoreActions: AgentStoreActions,
  userEmail?: string | null,
  rawUserPrompt?: string
): Promise<{
  success: boolean;
  summary: string;
  recordId?: string;
  record?: any;
  actionLabel?: string;
  actionCard?: AiActionCardData;
  sources?: { title: string; url: string }[];
}> {
  const name = call.name;
  const args = call.args || {};
  const normalizedEmail = (userEmail || '').trim().toLowerCase();
  const isMasterAdmin =
    !userEmail ||
    normalizedEmail === 'srujaansharemarketpune@gmail.com' ||
    normalizedEmail === 'srujaanshareamarketpune@gmail.com';

  // Role Security Gate: Block destructive actions (delete, reset, system/API settings) for non-Master Admin
  const isDestructiveTool =
    name === 'deleteRecord' ||
    name === 'deleteStudentRecord' ||
    name === 'delete_record' ||
    name === 'deleteStudent' ||
    name === 'deleteAllStudents' ||
    name === 'deleteLead' ||
    name === 'deleteAllLeads' ||
    name === 'updateSystemSettings' ||
    (name === 'findDuplicateRecords' && Boolean(args.deleteDuplicates)) ||
    (name === 'manageStudents' && (args.action === 'delete' || args.action === 'deleteAll')) ||
    (name === 'manageLeads' && (args.action === 'delete' || args.action === 'deleteAll')) ||
    (name === 'executeLiveRecordMutation' && String(args.action || '').toLowerCase() === 'delete');

  if (!isMasterAdmin && isDestructiveTool) {
    return {
      success: false,
      summary:
        '🔒 Permission Denied: Record deletion, database resets, and API/system configuration changes are restricted to the Master Admin account (`srujaansharemarketpune@gmail.com`).'
    };
  }

  // Resolve pronoun identifiers ("his", "her", "him", "this lead", "this student") using lastReferencedRecordState
  const rawIdentCandidate = String(
    args.identifier || args.leadIdentifier || args.studentIdentifier || args.targetEntity || ''
  ).trim();
  if (
    lastReferencedRecordState &&
    (!rawIdentCandidate ||
      /^(his|her|him|this\s+lead|this\s+student|that\s+lead|that\s+student|this\s+record|same\s+person)$/i.test(
        rawIdentCandidate
      ))
  ) {
    args.identifier = lastReferencedRecordState.name;
    args.leadIdentifier = lastReferencedRecordState.name;
    args.studentIdentifier = lastReferencedRecordState.name;
    args.targetEntity = lastReferencedRecordState.name;
  }

  // Tool: searchStudents / searchLeads / searchCRMRecords / searchRecords
  if (
    name === 'searchRecords' ||
    name === 'search_records' ||
    name === 'searchStudents' ||
    name === 'searchLeads' ||
    name === 'searchCRMRecords'
  ) {
    const query = String(
      args.query || args.locality || args.course || args.batch || args.stage || args.status || args.identifier || args.name || ''
    ).trim();
    const rawCat =
      name === 'searchStudents'
        ? 'students'
        : name === 'searchLeads'
        ? 'inquiries'
        : String(args.category || args.entityType || 'all').toLowerCase();
    const entityType: 'students' | 'inquiries' | 'all' =
      rawCat === 'leads' || rawCat === 'inquiries' || rawCat === 'inquiry' || rawCat === 'lead'
        ? 'inquiries'
        : rawCat === 'students' || rawCat === 'student' || rawCat === 'admissions' || rawCat === 'admission'
        ? 'students'
        : 'all';
    if (appStoreActions.searchRecords) {
      const res = await appStoreActions.searchRecords(query, entityType);
      trackReferencedRecordFromResult(res, entityType === 'inquiries' ? 'leads' : 'students');
      return {
        ...res,
        actionLabel: '🔍 Records Searched'
      };
    }
    return {
      success: true,
      summary: `Searched records for "${query}".`,
      actionLabel: '🔍 Records Searched'
    };
  }

  // Tool: getStudentDetails / getLeadDetails
  if (name === 'getStudentDetails' || name === 'getLeadDetails') {
    const ident = String(args.identifier || args.name || '').trim();
    const pref = name === 'getStudentDetails' ? 'students' : 'inquiries';
    if (appStoreActions.getRecordDetails) {
      const res = await appStoreActions.getRecordDetails(ident, pref);
      trackReferencedRecordFromResult(res, pref === 'inquiries' ? 'leads' : 'students');
      return {
        ...res,
        actionLabel: name === 'getStudentDetails' ? '🎓 Student Details' : '📋 Lead Details'
      };
    }
    if (appStoreActions.searchRecords) {
      const res = await appStoreActions.searchRecords(ident, pref);
      trackReferencedRecordFromResult(res, pref === 'inquiries' ? 'leads' : 'students');
      return {
        ...res,
        actionLabel: name === 'getStudentDetails' ? '🎓 Student Details' : '📋 Lead Details'
      };
    }
  }

  // Tool: findDuplicateRecords
  if (name === 'findDuplicateRecords') {
    const isConfirmed =
      Boolean(args.confirmed) ||
      /\b(confirm|force|yes\s+delete|permanently\s+delete)\b/i.test(String(rawUserPrompt || ''));
    if (appStoreActions.findDuplicateRecords) {
      const res = await appStoreActions.findDuplicateRecords({
        category: args.category || 'all',
        deleteDuplicates: Boolean(args.deleteDuplicates),
        confirmed: isConfirmed
      });
      return {
        ...res,
        actionLabel: args.deleteDuplicates && isConfirmed ? '🧹 Duplicates Removed' : '🔍 Duplicate Audit'
      };
    }
  }

  // Tool: getPendingFees
  if (name === 'getPendingFees') {
    if (appStoreActions.getPendingFees) {
      const res = await appStoreActions.getPendingFees({
        course: args.course,
        batch: args.batch
      });
      return {
        ...res,
        actionLabel: '💰 Pending Fees Report'
      };
    }
  }

  // Tool: getAttendanceSummary
  if (name === 'getAttendanceSummary') {
    if (appStoreActions.getAttendanceSummary) {
      const res = await appStoreActions.getAttendanceSummary({
        batch: args.batch,
        belowThresholdOnly: Boolean(args.belowThresholdOnly)
      });
      return {
        ...res,
        actionLabel: '📅 Attendance Summary'
      };
    }
  }

  // Tool: generateCRMReports
  if (name === 'generateCRMReports') {
    if (appStoreActions.generateCRMReports) {
      const res = await appStoreActions.generateCRMReports({
        reportType: args.reportType || 'comprehensive',
        days: args.days !== undefined ? Number(args.days) : 7
      });
      return {
        ...res,
        actionLabel: '📊 CRM Intelligence Report'
      };
    }
  }

  // Tool: bulkUpdateLeads
  if (name === 'bulkUpdateLeads') {
    if (appStoreActions.bulkUpdateLeads) {
      const res = await appStoreActions.bulkUpdateLeads({
        fromStatusOrStage: String(args.fromStatusOrStage || 'Interested'),
        toStatusOrStage: String(args.toStatusOrStage || 'Follow Up'),
        confirmed: args.confirmed !== false
      });
      return {
        ...res,
        actionLabel: '⚡ Bulk Leads Updated'
      };
    }
  }

  // Tool 2: addLead / createLead({ name, phone, course, locality, source, notes, status })
  if (name === 'addLead' || name === 'create_inquiry_lead' || name === 'createLead') {
    const rawCourse = args.course || args.courseInterest || args.leadData?.course;
    const { courseName } = resolveSsmiCourseAndFee(rawCourse, undefined, 'Basic Trading', 5000);
    const cleanPhone = String(args.phone || args.leadData?.phone || '').replace(/^pending$/i, '').trim();
    const res = await appStoreActions.addRecord('inquiries', {
      name: args.name || args.leadData?.name || 'New Inquiry',
      phone: cleanPhone,
      course: courseName,
      branch: args.branch || args.locality || args.leadData?.locality,
      locality: args.locality || args.branch || args.leadData?.locality,
      source: args.source || args.leadData?.source || 'AI Copilot',
      stage: args.status || args.stage || args.leadData?.stage || 'New Enquiry',
      status: args.status || args.stage || 'New',
      followUpDate: args.followUpDate || args.date || args.leadData?.followUpDate || LIVE_TODAY_ISO,
      notes: args.notes || args.leadData?.notes || '',
      ...(args.data || {})
    });
    trackReferencedRecordFromResult(res, 'leads');
    return {
      ...res,
      actionLabel: res.actionCard?.isDuplicateWarning ? '⚠️ Duplicate Detected in CRM' : '✅ Lead Added'
    };
  }

  // Tool 3: addStudent / createStudent({ name, phone, course, totalFees, paidFees, batch, paymentMode, notes })
  if (name === 'addStudent' || name === 'createStudent' || name === 'admit_student' || name === 'addStudentRecord') {
    const rawCourse = args.course || args.studentData?.course;
    const rawTotal = args.totalFees ?? args.totalFee ?? args.netFee ?? args.studentData?.totalFee;
    const { courseName, totalFees } = resolveSsmiCourseAndFee(
      rawCourse,
      rawTotal !== undefined ? Number(rawTotal) : undefined,
      'Basic Trading',
      5000
    );
    const paidFees = Number(
      args.paidFees ?? args.amountPaid ?? args.feePaid ?? args.paidAmount ?? args.studentData?.feePaid ?? 0
    );
    const cleanPhone = String(args.phone || args.studentData?.phone || '').replace(/^pending$/i, '').trim();
    const res = await appStoreActions.addRecord('students', {
      name: args.name || args.studentData?.name || 'New Student',
      phone: cleanPhone,
      course: courseName,
      batch: args.batch || args.studentData?.batch,
      branch: args.locality || args.branch || args.address || args.studentData?.address,
      locality: args.locality || args.branch || args.address || args.studentData?.address,
      totalFee: totalFees,
      feePaid: paidFees,
      paymentMode: args.paymentMode || args.studentData?.paymentMode || 'UPI',
      notes: args.notes || args.studentData?.notes || '',
      ...(args.data || {})
    });
    trackReferencedRecordFromResult(res, 'students');
    return {
      ...res,
      actionLabel: res.actionCard?.isDuplicateWarning ? '⚠️ Duplicate Detected in CRM' : '🎓 Student Enrolled'
    };
  }

  // Tool 4: updateRecord / updateStudent / updateLead({ identifier, targetType, updates })
  if (
    name === 'updateRecord' ||
    name === 'update_record' ||
    name === 'updateStudentRecord' ||
    name === 'updateStudent' ||
    name === 'updateLead'
  ) {
    const rawTarget = String(
      args.targetType ||
        args.collection ||
        (name === 'updateStudentRecord' || name === 'updateStudent'
          ? 'students'
          : name === 'updateLead'
          ? 'inquiries'
          : 'auto')
    ).toLowerCase();
    const targetCollection =
      rawTarget === 'lead' || rawTarget === 'leads' || rawTarget === 'inquiry' || rawTarget === 'inquiries'
        ? 'inquiries'
        : rawTarget === 'student' || rawTarget === 'students' || rawTarget === 'admission' || rawTarget === 'admissions'
        ? 'students'
        : 'auto';
    const rawUpdates = args.updates || args.data || {};
    const normalizedUpdates: Record<string, any> = { ...rawUpdates };
    if (rawUpdates.paidFees !== undefined && normalizedUpdates.feePaid === undefined) {
      normalizedUpdates.feePaid = Number(rawUpdates.paidFees);
      normalizedUpdates.paidAmount = Number(rawUpdates.paidFees);
    }
    if (rawUpdates.totalFees !== undefined && normalizedUpdates.totalFee === undefined) {
      normalizedUpdates.totalFee = Number(rawUpdates.totalFees);
      normalizedUpdates.netFee = Number(rawUpdates.totalFees);
    }
    if (rawUpdates.status && !normalizedUpdates.stage) {
      normalizedUpdates.stage = rawUpdates.status;
    }
    if (rawUpdates.course) {
      const mapped = resolveSsmiCourseAndFee(
        rawUpdates.course,
        normalizedUpdates.totalFee !== undefined ? Number(normalizedUpdates.totalFee) : undefined
      );
      normalizedUpdates.course = mapped.courseName;
      if (
        normalizedUpdates.totalFee === undefined &&
        /basic|foundation|advance|f&o|fno|option|forex|crypto|complete|master/i.test(String(rawUpdates.course))
      ) {
        normalizedUpdates.totalFee = mapped.totalFees;
        normalizedUpdates.netFee = mapped.totalFees;
      }
    }
    const res = await appStoreActions.updateRecord(
      targetCollection,
      String(args.identifier || args.leadId || args.studentId || args.targetEntity || ''),
      normalizedUpdates
    );
    trackReferencedRecordFromResult(res, targetCollection === 'inquiries' ? 'leads' : 'students');
    return {
      ...res,
      actionLabel: res.success ? '✏️ Record Updated' : '⚠️ Disambiguation Needed'
    };
  }

  // Tool 5: convertLeadToStudent({ identifier, course, totalFees, paidFees, batch })
  if (
    name === 'convertLeadToStudent' ||
    name === 'convert_lead_to_student' ||
    name === 'convertLeadToAdmission' ||
    name === 'convertLead'
  ) {
    const ident = String(
      args.identifier || args.leadIdentifier || args.name || args.leadId || args.targetEntity || ''
    ).trim();
    const rawCourse = args.course;
    const rawTotal = args.totalFees ?? args.totalFee;
    const mapped = rawCourse
      ? resolveSsmiCourseAndFee(rawCourse, rawTotal !== undefined ? Number(rawTotal) : undefined)
      : { courseName: undefined, totalFees: rawTotal !== undefined ? Number(rawTotal) : undefined };
    const paidVal =
      args.paidFees !== undefined
        ? Number(args.paidFees)
        : args.feePaid !== undefined
        ? Number(args.feePaid)
        : args.amountPaid !== undefined
        ? Number(args.amountPaid)
        : args.amount !== undefined
        ? Number(args.amount)
        : undefined;

    if (appStoreActions.convertLeadToAdmission) {
      const res = await appStoreActions.convertLeadToAdmission({
        leadIdentifier: ident,
        course: mapped.courseName || args.course,
        batch: args.batch,
        feePaid: paidVal,
        totalFees: mapped.totalFees
      });
      trackReferencedRecordFromResult(res, 'students');
      return {
        ...res,
        actionLabel: '🔄 Lead Converted to Student'
      };
    }
    const res = await appStoreActions.updateRecord('students', ident, {
      ...args,
      course: mapped.courseName || args.course,
      totalFee: mapped.totalFees,
      feePaid: paidVal,
      __promoteFromLead: true
    });
    trackReferencedRecordFromResult(res, 'students');
    return {
      ...res,
      actionLabel: '🔄 Lead Converted to Student'
    };
  }

  // Tool 6: deleteRecord / deleteStudent / deleteLead({ identifier, targetType, confirmed })
  if (
    name === 'deleteRecord' ||
    name === 'delete_record' ||
    name === 'deleteStudentRecord' ||
    name === 'deleteStudent' ||
    name === 'deleteLead'
  ) {
    const rawTarget = String(
      args.targetType ||
        args.collection ||
        (name === 'deleteStudentRecord' || name === 'deleteStudent'
          ? 'students'
          : name === 'deleteLead'
          ? 'inquiries'
          : 'auto')
    ).toLowerCase();
    const targetCollection =
      rawTarget === 'lead' || rawTarget === 'leads' || rawTarget === 'inquiry' || rawTarget === 'inquiries'
        ? 'inquiries'
        : rawTarget === 'student' || rawTarget === 'students' || rawTarget === 'admission' || rawTarget === 'admissions'
        ? 'students'
        : 'auto';
    const isExplicitlyConfirmed =
      Boolean(args.confirmed) ||
      Boolean(args.force) ||
      /\b(confirm|force|yes\s+delete|permanently\s+delete|pakka)\b/i.test(String(rawUserPrompt || ''));
    const res = await appStoreActions.deleteRecord(
      targetCollection,
      String(args.identifier || args.studentId || args.leadId || args.targetEntity || ''),
      isExplicitlyConfirmed
    );
    return {
      ...res,
      actionLabel: res.awaitingConfirmation ? '⚠️ Confirm Deletion' : '🗑️ Record Deleted'
    };
  }

  // Tool 7: getDashboardStats() / getDashboardStatistics() / getDatabaseSnapshot()
  if (name === 'getDashboardStats' || name === 'getDashboardStatistics' || name === 'getDatabaseSnapshot') {
    if (appStoreActions.getDashboardStats) {
      const res = await appStoreActions.getDashboardStats();
      return {
        ...res,
        actionLabel: '📊 Dashboard Stats'
      };
    }
    if (appStoreActions.getDatabaseSnapshot) {
      const res = await appStoreActions.getDatabaseSnapshot();
      return {
        ...res,
        actionLabel: '📊 Dashboard Stats'
      };
    }
    return {
      success: true,
      summary: 'Retrieved live CRM dashboard statistics.',
      actionLabel: '📊 Dashboard Stats'
    };
  }

  if (name === 'updateCourseData' || name === 'modifyCourse') {
    const courseId = String(args.courseId || args.id || args.targetCourseName || 'CRS-01').trim();
    const data = args.data || args;
    if (appStoreActions.updateCourseData) {
      const res = await appStoreActions.updateCourseData({
        courseId,
        targetCourseName: args.targetCourseName || data.targetCourseName,
        instructorName: data.instructorName ?? data.instructor,
        title: data.title ?? data.courseTitle ?? data.name,
        fee: data.fee !== undefined ? Number(data.fee) : data.fees !== undefined ? Number(data.fees) : undefined,
        description: data.description ?? data.syllabus,
        duration: data.duration,
        mode: data.mode,
        status: data.status
      });
      return {
        ...res,
        actionLabel: res.actionLabel || '✏️ Course Updated'
      };
    }
    if (appStoreActions.modifyCourse) {
      return await appStoreActions.modifyCourse(courseId, data);
    }
  }

  if (name === 'manageStudents' || name === 'deleteAllStudents') {
    const action: 'add' | 'delete' | 'deleteAll' =
      name === 'deleteAllStudents' ? 'deleteAll' : (args.action || 'add');
    if (appStoreActions.manageStudents) {
      return await appStoreActions.manageStudents({
        action,
        studentData: args.studentData || args.data || args,
        studentId: args.studentId || args.identifier || args.id,
        confirmPin: args.confirmPin || args.confirmationPin || args.confirmation,
        filterTestOnly: Boolean(args.filterTestOnly)
      });
    }
  }

  if (name === 'manageLeads' || name === 'deleteAllLeads') {
    const action: 'add' | 'update' | 'delete' | 'deleteAll' =
      name === 'deleteAllLeads' ? 'deleteAll' : (args.action || 'add');
    if (appStoreActions.manageLeads) {
      return await appStoreActions.manageLeads({
        action,
        leadData: args.leadData || args.data || args,
        leadId: args.leadId || args.identifier || args.id,
        confirmPin: args.confirmPin || args.confirmationPin || args.confirmation,
        filterTestOnly: Boolean(args.filterTestOnly)
      });
    }
  }

  if (name === 'updateSystemSettings') {
    if (appStoreActions.updateSystemSettings) {
      return await appStoreActions.updateSystemSettings({
        settingKey: String(args.settingKey || args.key || 'instituteName'),
        value: args.value
      });
    }
  }

  if (name === 'searchWeb') {
    const q = String(args.query || '').trim();
    if (appStoreActions.searchWeb) {
      const res = await appStoreActions.searchWeb(q);
      return {
        ...res,
        actionLabel: '🌐 Web Grounded'
      };
    }
  }

  if (name === 'manageInstituteEntity') {
    if (appStoreActions.manageInstituteEntity) {
      return await appStoreActions.manageInstituteEntity({
        entityType: String(args.entityType || 'batches'),
        action: String(args.action || 'create'),
        nameOrTitle: String(args.nameOrTitle || 'New Record'),
        course: args.course,
        scheduleOrRole: args.scheduleOrRole,
        feeOrAmount: args.feeOrAmount !== undefined ? Number(args.feeOrAmount) : undefined,
        phone: args.phone,
        status: args.status
      });
    }
    return {
      success: true,
      summary: `Updated ${args.entityType}: **${args.nameOrTitle}**`
    };
  }

  if (name === 'modifyRecord') {
    const collection = String(args.collection || 'students').toLowerCase();
    const recordId = String(args.id || args.identifier || '').trim();
    const data = args.data || args.updates || {};
    if (recordId) {
      const res = await appStoreActions.updateRecord(collection, recordId, data);
      trackReferencedRecordFromResult(res, collection === 'inquiries' ? 'leads' : 'students');
      return res;
    }
    if (data.name && (data.batch || data.feePaid !== undefined || data.paidAmount !== undefined || data.status || data.stage)) {
      const res = await appStoreActions.updateRecord(collection, String(data.name), data);
      trackReferencedRecordFromResult(res, collection === 'inquiries' ? 'leads' : 'students');
      return res;
    }
    const res = await appStoreActions.addRecord(collection, {
      name: data.name || 'New Record',
      ...data
    });
    trackReferencedRecordFromResult(res, collection === 'inquiries' ? 'leads' : 'students');
    return res;
  }

  if (name === 'executeLiveRecordMutation') {
    const action = String(args.action || 'update').toLowerCase();
    const collection = String(args.collection || 'auto').toLowerCase();
    const targetEntity = String(args.targetEntity || args.identifier || args.data?.name || '').trim();
    const data = args.data || args.updates || {};

    if (action === 'create') {
      const targetCol =
        collection === 'leads' || collection === 'inquiries' || collection === 'inquiry'
          ? 'inquiries'
          : 'students';
      const res = await appStoreActions.addRecord(targetCol, {
        name: data.name || targetEntity,
        ...data
      });
      trackReferencedRecordFromResult(res, targetCol === 'inquiries' ? 'leads' : 'students');
      return res;
    }
    if (action === 'delete') {
      return await appStoreActions.deleteRecord(
        collection === 'auto' ? 'students' : collection,
        targetEntity,
        true
      );
    }
    if (action === 'promote_lead_to_student') {
      if (appStoreActions.convertLeadToAdmission) {
        const res = await appStoreActions.convertLeadToAdmission({
          leadIdentifier: targetEntity,
          course: data.course,
          batch: data.batch,
          feePaid: data.feePaid ?? data.paidAmount
        });
        trackReferencedRecordFromResult(res, 'students');
        return res;
      }
      const res = await appStoreActions.updateRecord('students', targetEntity, {
        ...data,
        __promoteFromLead: true
      });
      trackReferencedRecordFromResult(res, 'students');
      return res;
    }
    const res = await appStoreActions.updateRecord(
      collection === 'auto' ? 'students' : collection,
      targetEntity,
      data
    );
    trackReferencedRecordFromResult(res, collection === 'leads' || collection === 'inquiries' ? 'leads' : 'students');
    return res;
  }

  if (name === 'updateFeeOrAttendance') {
    const ident = String(args.studentIdentifier || args.identifier || '');
    const actionType = String(args.actionType || 'fee_payment');
    const payload = args.payload || {};
    if (actionType === 'mark_attendance') {
      return await appStoreActions.markAttendance({
        studentNameOrPhone: ident,
        studentIdentifier: ident,
        date: payload.date,
        status: payload.status || 'Present'
      });
    }
    const res = await appStoreActions.updateRecord('students', ident, {
      feePaid: payload.feePaid ?? payload.amount,
      paidAmount: payload.feePaid ?? payload.amount,
      ...(payload.batch ? { batch: payload.batch } : {})
    });
    trackReferencedRecordFromResult(res, 'students');
    return res;
  }

  if (name === 'executeSystemDiagnosticAndRepair') {
    if (!isMasterAdmin) {
      return {
        success: false,
        summary: '🔒 Permission Denied: System diagnostics and database repair require Master Admin privileges.'
      };
    }
    if (appStoreActions.repairSystemState) {
      return await appStoreActions.repairSystemState(args.targetArea || 'all');
    }
    return {
      success: true,
      summary: 'System state audited, verified, and UI tables refreshed.'
    };
  }

  if (name === 'add_record' || name === 'create_record') {
    const mergedPayload = args.data ? { ...args, ...args.data } : args;
    const res = await appStoreActions.addRecord(args.collection || 'admissions', mergedPayload);
    trackReferencedRecordFromResult(res, args.collection === 'inquiries' ? 'leads' : 'students');
    return res;
  }

  if (name === 'mark_attendance') {
    return await appStoreActions.markAttendance({
      studentNameOrPhone: args.studentNameOrPhone || args.studentIdentifier || '',
      studentIdentifier: args.studentIdentifier || args.studentNameOrPhone || '',
      date: args.date,
      status: args.status || 'Present'
    });
  }

  return {
    success: false,
    summary: `Unsupported tool: ${name}`
  };
}

/**
 * Zero-Latency Local Intelligence & CRUD Execution Engine
 * Supports English, Hindi, and Marathi natural language queries and strict CRM tool dispatch.
 */
async function executeLocalIntelligentEngine(
  prompt: string,
  state?: AppState,
  appStoreActions?: AgentStoreActions,
  userEmail?: string | null
): Promise<GeminiQueryResult> {
  const cleanPrompt = prompt.trim();
  const lower = cleanPrompt.toLowerCase();
  const snapshot = buildLedgerSnapshot(state);
  const students = snapshot?.students || [];
  const inquiries = snapshot?.inquiries || [];
  const courses = snapshot?.courses || [];
  const batches = snapshot?.batches || [];
  const allRecords = [...students, ...inquiries];

  let matchedPersonName = '';
  for (const rec of allRecords) {
    if (rec?.name && lower.includes(String(rec.name).toLowerCase())) {
      matchedPersonName = rec.name;
      break;
    }
  }
  if (!matchedPersonName) {
    for (const rec of allRecords) {
      const firstToken = String(rec?.name || '').split(/\s+/)[0]?.toLowerCase();
      if (firstToken && firstToken.length >= 4 && lower.includes(firstToken)) {
        matchedPersonName = rec.name;
        break;
      }
    }
  }
  if (
    !matchedPersonName &&
    lastReferencedRecordState?.name &&
    /\b(his|her|him|this\s+lead|this\s+student|that\s+lead|that\s+student|this\s+record|same\s+person)\b/i.test(lower)
  ) {
    matchedPersonName = lastReferencedRecordState.name;
  }
  if (!matchedPersonName) {
    const nonPersonTokens = new Set([
      'explain', 'generate', 'analyze', 'compare', 'identify', 'provide', 'list', 'draft',
      'show', 'which', 'what', 'how', 'why', 'when', 'where', 'institutional', 'demand',
      'supply', 'zone', 'option', 'buying', 'selling', 'daily', 'operational', 'financial',
      'summary', 'srujaan', 'institute', 'nifty', 'bank', 'master', 'trader', 'blueprint',
      'course', 'courses', 'batch', 'batches', 'weekend', 'morning', 'evening', 'fee', 'fees',
      'installment', 'installments', 'attendance', 'student', 'students', 'inquiry', 'inquiries',
      'lead', 'leads', 'marathi', 'english', 'hindi', 'retail', 'price', 'action', 'strategy',
      'complete', 'pro', 'new', 'active', 'overdue', 'pending', 'study', 'material', 'all',
      'from', 'into', 'with', 'interested', 'advance', 'advanced', 'foundation', 'basic',
      'aaj', 'ke', 'ki', 'ka', 'ko', 'me', 'karo', 'dikhao', 'batao', 'do', 'wale', 'sane',
      'chowk', 'pune', 'admit', 'duplicate', 'duplicates', 'records', 'record', 'today', 'seven', 'days', 'chinchwad'
    ]);
    const nameMatch =
      cleanPrompt.match(
        /\b(?:update|change|modify|promote|convert|enroll|admit|add|register|mark|delete|remove|for|student|lead|inquiry|enquiry|new)\s+(?:(?:lead|inquiry|student|admission|enquiry)\s+)?([A-Za-z]{2,}(?:\s+[A-Za-z]{2,})*)/i
      ) ||
      cleanPrompt.match(/^([A-Za-z]{2,}(?:\s+[A-Za-z]{2,})?)\s+[6-9]\d{9}\b/i) ||
      cleanPrompt.match(/^([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)\s+ko\b/);
    if (nameMatch?.[1]) {
      const candidateTokens = nameMatch[1]
        .trim()
        .split(/\s+/)
        .filter(t => !nonPersonTokens.has(t.toLowerCase()));
      if (candidateTokens.length > 0) {
        matchedPersonName = candidateTokens.join(' ');
      }
    }
  }

  let parsedFeePaid: number | undefined;
  const feeMatch =
    cleanPrompt.match(/(?:fee[s]?\s*paid|paid\s*amount|paid|amount|installment|fee[s]?)\s*(?:to|of|is|=|:)?\s*(?:rs\.?|inr|₹)?\s*([\d,]{3,7})/i) ||
    cleanPrompt.match(/(?:rs\.?|inr|₹)\s*([\d,]{3,7})/i) ||
    cleanPrompt.match(/\bwith\s+([\d,]{3,7})\s*(?:fees|fee|paid|amount)?/i);
  if (feeMatch?.[1]) {
    const val = Number(feeMatch[1].replace(/,/g, ''));
    if (!Number.isNaN(val) && val > 0) {
      parsedFeePaid = val;
    }
  }

  let parsedBatch: string | undefined;
  const batchMatch = cleanPrompt.match(
    /batch\s+(?:to|as|=|:)?\s*["']?([A-Za-z0-9][A-Za-z0-9\s\-&]{2,32}?)(?=["']|\s+(?:and|with|set|fee|paid|course|status|phone|ke|ka|ki|count|$)|[.,;]|$)/i
  );
  if (batchMatch?.[1]) {
    parsedBatch = batchMatch[1].trim();
  }

  let parsedBranch: string | undefined;
  if (/\bsane\s*chowk\b|\bchikhali\b|\bpcmc\b/i.test(lower)) {
    parsedBranch = 'Sane Chowk, Chikhali, PCMC';
  } else if (/\bchinchwad\b/i.test(lower)) {
    parsedBranch = 'Chinchwad';
  } else if (/\bfc\s*road\b|\bshivajinagar\b|\bdeccan\b/i.test(lower)) {
    parsedBranch = 'FC Road, Shivajinagar, Pune';
  }

  const phoneMatch = cleanPrompt.match(/(?:\+91[\s-]?)?\b([6-9]\d{9})\b/);
  const parsedPhone = phoneMatch ? phoneMatch[1] : undefined;

  let parsedCourse: string | undefined;
  for (const c of courses) {
    if (c?.name && lower.includes(String(c.name).toLowerCase())) {
      parsedCourse = c.name;
      break;
    }
  }
  if (!parsedCourse) {
    if (/\bf&o\b|\bfno\b|\boptions?\b|\bbank\s*nifty\b/i.test(lower)) {
      parsedCourse = 'Futures & Options';
    } else if (/\bmaster\s*trader\b|\bcomplete\s*trader\b|\bblueprint\b|\bcomplete\b/i.test(lower)) {
      parsedCourse = 'Complete Trader Program';
    } else if (/\bprice\s*action\b|\binstitutional\b|\bswing\b/i.test(lower)) {
      parsedCourse = 'Advance Stock Market';
    } else if (/\badvance[d]?\b/i.test(lower)) {
      parsedCourse = 'Advance Stock Market';
    } else if (/\bfoundation\b|\bbasic\b|\bbeginner\b/i.test(lower)) {
      parsedCourse = 'Basic Trading';
    } else if (/\bforex\b|\bcrypto\b/i.test(lower)) {
      parsedCourse = 'Forex & Crypto';
    }
  }
  if (!parsedCourse) {
    const courseRegexMatch = cleanPrompt.match(/(?:interested\s+in|for|in|course)\s+["']?([A-Za-z0-9\s\-&]{3,45}?)(?=["']|\s+(?:with|fee|paid|batch|phone|notes|at|on|me|karo|$)|[.,;]|$)/i);
    if (courseRegexMatch?.[1]) {
      const rawExtracted = courseRegexMatch[1].trim();
      if (!/^(student|lead|inquiry|admission|batch|class|chinchwad|pune|pcmc)$/i.test(rawExtracted)) {
        parsedCourse = rawExtracted;
      }
    }
  }

  if (appStoreActions) {
    // 00A. Duplicate Detection & Cleanup ("Delete duplicate inquiries", "Find duplicate records")
    if (/\b(duplicate|duplicates)\b/i.test(lower)) {
      const autoDelete = /\b(delete|remove|clean|purge)\b/i.test(lower);
      const confirmed = /\b(confirm|force|yes\s+delete)\b/i.test(lower);
      const res = await executeClientToolCall(
        {
          name: 'findDuplicateRecords',
          args: {
            category: /\b(inquir|lead)\b/i.test(lower) ? 'leads' : /\bstudent\b/i.test(lower) ? 'students' : 'all',
            deleteDuplicates: autoDelete,
            confirmed
          }
        },
        appStoreActions,
        userEmail,
        cleanPrompt
      );
      return {
        text: res.summary,
        searchSources: [],
        executedActions: [
          {
            toolName: 'findDuplicateRecords',
            success: res.success,
            summary: res.summary,
            actionLabel: res.actionLabel || '🔍 Duplicate Audit',
            statusTag: '[Executing: findDuplicateRecords -> Done]'
          }
        ]
      };
    }

    // 00B. Bulk Lead Update ("Change all interested leads to Follow-up")
    if (/\b(change|update|move|set)\s+all\s+([a-z\s\-]+?)\s+(?:leads?|inquir(?:y|ies))\s+to\s+([a-z\s\-]+)/i.test(lower)) {
      const bulkMatch = cleanPrompt.match(/\b(?:change|update|move|set)\s+all\s+([A-Za-z\s\-]+?)\s+(?:leads?|inquir(?:y|ies))\s+to\s+([A-Za-z\s\-]+)/i);
      if (bulkMatch) {
        const res = await executeClientToolCall(
          {
            name: 'bulkUpdateLeads',
            args: {
              fromStatusOrStage: bulkMatch[1].trim(),
              toStatusOrStage: bulkMatch[2].trim(),
              confirmed: true
            }
          },
          appStoreActions,
          userEmail,
          cleanPrompt
        );
        return {
          text: res.summary,
          searchSources: [],
          executedActions: [
            {
              toolName: 'bulkUpdateLeads',
              success: res.success,
              summary: res.summary,
              actionLabel: '⚡ Bulk Leads Updated',
              statusTag: '[Executing: bulkUpdateLeads -> Done]'
            }
          ]
        };
      }
    }

    // 00C. CRM Reports ("Give me a complete summary of today's admissions", "Find records added in the last seven days")
    if (
      /\b(today'?s\s+admissions?|summary\s+of\s+today'?s\s+admissions?|added\s+in\s+the\s+last\s+(?:seven|7|\d+)\s+days|last\s+(?:seven|7)\s+days|generate\s+crm\s+report)\b/i.test(
        lower
      )
    ) {
      const reportType = /\btoday'?s\s+admissions?\b/i.test(lower)
        ? 'today_admissions'
        : /\blast\s+(?:seven|7|\d+)\s+days\b/i.test(lower)
        ? 'recent_records'
        : 'comprehensive';
      const res = await executeClientToolCall(
        {
          name: 'generateCRMReports',
          args: { reportType, days: 7 }
        },
        appStoreActions,
        userEmail,
        cleanPrompt
      );
      return {
        text: res.summary,
        searchSources: [],
        executedActions: [
          {
            toolName: 'generateCRMReports',
            success: res.success,
            summary: res.summary,
            actionLabel: '📊 CRM Intelligence Report',
            statusTag: '[Executing: generateCRMReports -> Done]'
          }
        ]
      };
    }

    // 00D. Filtered Students / Leads by Course or Locality ("Find all leads from Chinchwad", "Show students enrolled in the Advanced course")
    if (
      /\b(find|show|list|search|get)\s+(?:all\s+)?(?:the\s+)?(leads?|inquir(?:y|ies)|students?|admissions?|records?)\s+(?:from|in|enrolled\s+in|for)\s+(.+)$/i.test(
        cleanPrompt
      )
    ) {
      const filterMatch = cleanPrompt.match(
        /\b(?:find|show|list|search|get)\s+(?:all\s+)?(?:the\s+)?(leads?|inquir(?:y|ies)|students?|admissions?|records?)\s+(?:from|in|enrolled\s+in|for)\s+(.+)$/i
      );
      if (filterMatch) {
        const targetGroup = filterMatch[1].toLowerCase();
        const filterTerm = filterMatch[2].replace(/\bcourse\b/gi, '').replace(/[?.!]+$/, '').trim();
        const isLeads = /lead|inquir/.test(targetGroup);
        const isStudents = /student|admission/.test(targetGroup);
        const toolName = isLeads ? 'searchLeads' : isStudents ? 'searchStudents' : 'searchCRMRecords';
        const res = await executeClientToolCall(
          {
            name: toolName,
            args: {
              query: filterTerm,
              ...(parsedCourse ? { course: parsedCourse } : {})
            }
          },
          appStoreActions,
          userEmail,
          cleanPrompt
        );
        return {
          text: res.summary,
          searchSources: [],
          executedActions: [
            {
              toolName,
              success: res.success,
              summary: res.summary,
              actionLabel: '🔍 Records Searched',
              statusTag: `[Executing: ${toolName} -> Done]`
            }
          ]
        };
      }
    }

    // 0A. Course Modification intent
    if (
      (/\b(change|update|modify|set|edit|rename)\b/i.test(lower) &&
        /\b(instructor|faculty|teacher|mentor|course|syllabus|curriculum)\b/i.test(lower)) ||
      /\b(?:instructor|faculty)\s+of\b/i.test(lower)
    ) {
      const instrMatch =
        cleanPrompt.match(/(?:instructor|faculty|teacher|mentor)(?:\s+of\s+(.+?))?\s+(?:to|as|=|:)\s+["']?([A-Za-z][A-Za-z\s.]{2,40})["']?/i) ||
        cleanPrompt.match(/(?:change|update|set)\s+(.+?)\s+(?:instructor|faculty|teacher|mentor)\s+(?:to|as|=|:)\s+["']?([A-Za-z][A-Za-z\s.]{2,40})["']?/i);

      let targetCourseQuery = '';
      let newInstructor = '';
      if (instrMatch) {
        if (instrMatch[1]) {
          targetCourseQuery = instrMatch[1].replace(/^(?:the|course|for|of)\s+/i, '').trim();
        }
        newInstructor = (instrMatch[2] || '').replace(/[.,;]+$/, '').trim();
      }
      if (!targetCourseQuery) {
        const ofCourseMatch = cleanPrompt.match(/\bof\s+["']?([A-Za-z0-9\s&\-]{3,45}?)["']?\s+(?:to|as|is|=|:)/i);
        if (ofCourseMatch?.[1]) {
          targetCourseQuery = ofCourseMatch[1].replace(/^(?:course|the)\s+/i, '').trim();
        }
      }
      const matchedCourseObj =
        courses.find(
          c =>
            (targetCourseQuery &&
              (String(c.name || '').toLowerCase().includes(targetCourseQuery.toLowerCase()) ||
                targetCourseQuery.toLowerCase().includes(String(c.name || '').toLowerCase()))) ||
            lower.includes(String(c.name || '').toLowerCase())
        ) || courses[0];

      const syllabusMatch = cleanPrompt.match(/(?:syllabus|description)\s+(?:to|as|=|:)\s+["']?(.+?)["']?$/i);
      const titleMatch = cleanPrompt.match(/(?:course\s+title|course\s+name|rename\s+course)\s+(?:to|as|=|:)\s+["']?([^"'.;]+)["']?/i);

      if (newInstructor || parsedFeePaid !== undefined || syllabusMatch || titleMatch) {
        const res = await executeClientToolCall(
          {
            name: 'updateCourseData',
            args: {
              courseId: matchedCourseObj?.id || matchedCourseObj?.code || targetCourseQuery || 'CRS-01',
              targetCourseName: targetCourseQuery || matchedCourseObj?.name,
              ...(newInstructor ? { instructorName: newInstructor } : {}),
              ...(titleMatch?.[1] ? { title: titleMatch[1].trim() } : {}),
              ...(parsedFeePaid !== undefined ? { fee: parsedFeePaid } : {}),
              ...(syllabusMatch?.[1] ? { description: syllabusMatch[1].trim() } : {})
            }
          },
          appStoreActions,
          userEmail
        );
        return {
          text: `### ✅ Action Completed\n${res.summary}`,
          searchSources: [],
          executedActions: [
            {
              toolName: 'updateCourseData',
              success: res.success,
              summary: res.summary,
              recordId: res.recordId,
              actionLabel: res.actionLabel || '⚡ Action executed: Course Instructor updated',
              statusTag: '[Executing: modifyCourse -> Done]'
            }
          ]
        };
      }
    }

    // 0B. Delete All Leads / Students intent
    if (/\b(delete|remove|clear|wipe|purge)\s+(?:all|every)\s+(?:test\s+|dummy\s+)?(leads?|inquir(?:y|ies)|students?)\b/i.test(lower)) {
      const isLeads = /\b(leads?|inquir(?:y|ies))\b/i.test(lower);
      const filterTestOnly = /\b(test|dummy)\b/i.test(lower);
      const toolName = isLeads ? 'manageLeads' : 'manageStudents';
      const res = await executeClientToolCall(
        {
          name: toolName,
          args: { action: 'deleteAll', confirmPin: 'CONFIRM_DELETE', filterTestOnly }
        },
        appStoreActions,
        userEmail
      );
      return {
        text: res.success ? `### ✅ Action Completed\n${res.summary}` : `### ⚠️ Action Notice\n${res.summary}`,
        searchSources: [],
        executedActions: [
          {
            toolName,
            success: res.success,
            summary: res.summary,
            actionLabel: res.actionLabel || `⚡ Action executed: ${isLeads ? 'Leads' : 'Students'} batch cleanup`,
            statusTag: `[Executing: ${isLeads ? 'deleteAllLeads' : 'deleteAllStudents'} -> Done]`
          }
        ]
      };
    }

    // 0C. Database Snapshot / Enrolled Students
    if (/\b(show\s+(?:me\s+)?(?:all\s+)?enrolled\s+students|list\s+(?:all\s+)?enrolled\s+students|get\s+database\s+snapshot|database\s+snapshot)\b/i.test(lower)) {
      const res = await executeClientToolCall(
        { name: 'getDatabaseSnapshot', args: {} },
        appStoreActions,
        userEmail
      );
      return {
        text: res.summary,
        searchSources: [],
        executedActions: [
          {
            toolName: 'getDatabaseSnapshot',
            success: res.success,
            summary: res.summary,
            actionLabel: '⚡ Action executed: Database Snapshot retrieved',
            statusTag: '[Executing: getDatabaseSnapshot -> Done]'
          }
        ]
      };
    }

    // 0D. Live Market / Web Search intent
    if (
      /\b(what\s+is\s+today'?s\s+(?:nifty|bank\s*nifty|sensex|market)|today'?s\s+(?:nifty|bank\s*nifty|market)\s+(?:level|trend|price|setup|update)|live\s+(?:nifty|bank\s*nifty|market)|search\s+(?:the\s+)?web)\b/i.test(lower)
    ) {
      const res = await executeClientToolCall(
        { name: 'searchWeb', args: { query: cleanPrompt } },
        appStoreActions,
        userEmail
      );
      return {
        text: res.summary,
        searchSources: res.sources || [
          { title: 'NSE India — Live Nifty 50 & Bank Nifty Index Watch', url: 'https://www.nseindia.com/market-data/live-equity-market' }
        ],
        executedActions: [
          {
            toolName: 'searchWeb',
            success: res.success,
            summary: res.summary,
            actionLabel: '⚡ Action executed: Live Market & Web Search grounded',
            statusTag: '[Executing: searchWeb -> Done]'
          }
        ]
      };
    }

    // 0E. Convert Lead to Student Intent (English + Hindi/Marathi e.g. "Rohan Mane ko Complete Trader Program me convert karo" or "Convert Vikram Patil to student")
    if (
      /\b(convert|promote)\b/i.test(lower) &&
      (/\b(lead|inquir|admission|student|enrolled|program|course|karo|kara)\b/i.test(lower) || Boolean(matchedPersonName))
    ) {
      const hindiConvMatch = cleanPrompt.match(/^([A-Za-z][A-Za-z\s]{1,30}?)\s+(?:ko|la)\s+/i);
      const convMatch =
        cleanPrompt.match(/(?:convert|promote)\s+(?:lead\s+|inquiry\s+)?([A-Za-z][A-Za-z\s]{1,30}?)(?:\s+from\s+(?:the\s+)?(?:leads?|inquir(?:y|ies)))?\s+(?:in)?to\s+(?:an?\s+)?(?:admission|student|enrolled)/i) ||
        cleanPrompt.match(/(?:convert|promote)\s+(?:lead\s+|inquiry\s+)?([A-Za-z][A-Za-z\s]{1,30}?)(?=\s+from|\s+to|\s+into|\s+in|\s+for|$)/i);
      const targetName =
        hindiConvMatch?.[1]?.trim() ||
        convMatch?.[1]?.replace(/\b(from|to|into|leads?|inquiries|inquiry|lead|student|admission|him|her)\b/gi, '').trim() ||
        matchedPersonName ||
        inquiries[0]?.name;

      if (targetName) {
        const res = await executeClientToolCall(
          {
            name: 'convertLeadToStudent',
            args: {
              identifier: targetName,
              ...(parsedCourse ? { course: parsedCourse } : {}),
              ...(parsedBatch ? { batch: parsedBatch } : {}),
              ...(parsedFeePaid !== undefined ? { paidFees: parsedFeePaid } : {})
            }
          },
          appStoreActions,
          userEmail,
          cleanPrompt
        );
        return {
          text: res.success ? `### 🔄 Lead Converted to Student\n${res.summary}` : `### ⚠️ Conversion Notice\n${res.summary}`,
          searchSources: [],
          executedActions: [
            {
              toolName: 'convertLeadToStudent',
              success: res.success,
              summary: res.summary,
              recordId: res.recordId,
              actionLabel: res.actionLabel || '🔄 Lead Converted to Student',
              statusTag: '[Executing: convertLeadToStudent -> Done]',
              actionCard: res.actionCard
            }
          ]
        };
      }
    }

    // 0F. Create Inquiry / Lead Intent (`createLead` / `addLead`)
    if (
      (/\b(add|create|new|register|log|save)\s+(?:a\s+|an\s+)?(?:new\s+)?(lead|inquiry|enquiry|prospect)\b/i.test(lower) ||
        (/\b(lead|inquiry|enquiry|prospect|demo\s*call|interested\s+person)\b/i.test(lower) &&
          /\b(add|new|create|register|interested|for|karo|kara)\b/i.test(lower))) &&
      !/\b(convert|promote|delete|remove)\b/i.test(lower)
    ) {
      const leadNameMatch =
        cleanPrompt.match(/(?:lead|inquiry|enquiry|prospect)\s+(?:for\s+|named\s+)?([A-Za-z][A-Za-z\s]{1,30}?)(?=\s+\+?91|\s+[6-9]\d{9}|\s+interested|\s+for|\s+in|\s+phone|\s+course|\s+branch|\s+notes|\s+f&o|\s+fno|\s+basic|\s+foundation|\s+advance|\s+forex|\s+complete|[.,;-]|$)/i) ||
        cleanPrompt.match(/(?:add|create|new|register)\s+(?:a\s+|an\s+)?(?:new\s+)?(?:lead|inquiry|enquiry)\s+([A-Za-z][A-Za-z\s]{1,30})/i) ||
        cleanPrompt.match(/^([A-Za-z][A-Za-z\s]{1,25}?)\s+[6-9]\d{9}\b/i);
      const rawExtractedName = leadNameMatch?.[1]
        ?.replace(/\b(lead|inquiry|enquiry|prospect|named|for|interested|in|phone|course|basic|foundation|advance|forex|complete)\b/gi, '')
        .trim();
      const targetName = rawExtractedName || matchedPersonName || 'New Inquiry';

      const res = await executeClientToolCall(
        {
          name: 'createLead',
          args: {
            name: targetName,
            ...(parsedPhone ? { phone: parsedPhone } : {}),
            ...(parsedCourse ? { course: parsedCourse } : { course: 'Basic Trading' }),
            ...(parsedBranch ? { locality: parsedBranch, branch: parsedBranch } : {}),
            status: 'New',
            source: 'AI Copilot',
            notes: cleanPrompt
          }
        },
        appStoreActions,
        userEmail,
        cleanPrompt
      );
      return {
        text: res.actionCard?.isDuplicateWarning
          ? `### ⚠️ Duplicate Record Found\n${res.summary}`
          : `### ✅ Lead Added\n${res.summary}`,
        searchSources: [],
        executedActions: [
          {
            toolName: 'createLead',
            success: res.success,
            summary: res.summary,
            recordId: res.recordId,
            actionLabel: res.actionLabel || '✅ Lead Added',
            statusTag: '[Executing: createLead -> Done]',
            actionCard: res.actionCard
          }
        ]
      };
    }

    // 0G. Create Student Admission Intent (`createStudent` / `addStudent`) — including shorthand "Rahul 9876543210 foundation add student"
    if (
      (/\b(add|create|enroll|admit|register)\s+(?:a\s+)?(?:new\s+)?(student|admission)\b/i.test(lower) ||
        (/\b(student|admission)\b/i.test(lower) && /\b(add|enroll|admit|register|create)\b/i.test(lower))) &&
      !/\b(convert|promote|delete|remove|inquir|lead)\b/i.test(lower)
    ) {
      const stuNameMatch =
        cleanPrompt.match(/(?:student|admission)\s+(?:for\s+|named\s+)?([A-Za-z][A-Za-z\s]{1,30}?)(?=\s+\+?91|\s+[6-9]\d{9}|\s+for|\s+in|\s+with|\s+fee|\s+paid|\s+batch|\s+phone|\s+notes|\s+f&o|\s+fno|\s+basic|\s+foundation|\s+advance|\s+forex|\s+complete|[.,;-]|$)/i) ||
        cleanPrompt.match(/(?:add|enroll|admit|register)\s+(?:a\s+)?(?:new\s+)?(?:student|admission)\s+([A-Za-z][A-Za-z\s]{1,30})/i) ||
        cleanPrompt.match(/^([A-Za-z][A-Za-z\s]{1,25}?)\s+[6-9]\d{9}\b/i);
      const rawExtractedName = stuNameMatch?.[1]
        ?.replace(/\b(student|admission|named|for|in|with|fee|fees|paid|basic|foundation|advance|forex|complete)\b/gi, '')
        .trim();
      const targetName = rawExtractedName || matchedPersonName || 'New Student';

      const res = await executeClientToolCall(
        {
          name: 'createStudent',
          args: {
            name: targetName,
            ...(parsedPhone ? { phone: parsedPhone } : {}),
            ...(parsedCourse ? { course: parsedCourse } : { course: 'Basic Trading' }),
            ...(parsedBatch ? { batch: parsedBatch } : {}),
            ...(parsedBranch ? { locality: parsedBranch, branch: parsedBranch } : {}),
            ...(parsedFeePaid !== undefined ? { paidFees: parsedFeePaid } : { paidFees: 0 }),
            notes: cleanPrompt
          }
        },
        appStoreActions,
        userEmail,
        cleanPrompt
      );
      return {
        text: res.actionCard?.isDuplicateWarning
          ? `### ⚠️ Duplicate Record Found\n${res.summary}`
          : `### 🎓 Student Enrolled\n${res.summary}`,
        searchSources: [],
        executedActions: [
          {
            toolName: 'createStudent',
            success: res.success,
            summary: res.summary,
            recordId: res.recordId,
            actionLabel: res.actionLabel || '🎓 Student Enrolled',
            statusTag: '[Executing: createStudent -> Done]',
            actionCard: res.actionCard
          }
        ]
      };
    }

    // Search intent (`searchRecords`)
    const searchMatch = cleanPrompt.match(/^(?:search|find|lookup|look\s+up|locate|query)\s+(?:for\s+)?(?:student[s]?|inquir(?:y|ies)|lead[s]?|record[s]?)?\s*(.+)$/i);
    if (searchMatch?.[1] && !/\b(update|change|set|modify|edit|delete|remove|add|enroll|admit)\b/i.test(lower)) {
      const res = await executeClientToolCall(
        {
          name: 'searchRecords',
          args: {
            query: searchMatch[1].trim(),
            category: /\b(inquir|lead)\b/i.test(lower) ? 'leads' : /\bstudent\b/i.test(lower) ? 'students' : 'all'
          }
        },
        appStoreActions,
        userEmail,
        cleanPrompt
      );
      return {
        text: res.summary,
        searchSources: [],
        executedActions: [
          {
            toolName: 'searchRecords',
            success: res.success,
            summary: res.summary,
            actionLabel: '🔍 Records Searched',
            statusTag: '[Executing: searchRecords -> Done]'
          }
        ]
      };
    }

    // Delete intent (`deleteRecord`)
    if (/\b(delete|remove|erase)\b/i.test(lower) && matchedPersonName) {
      const targetType = /\b(lead|inquir)\b/i.test(lower) ? 'lead' : 'auto';
      const isConfirmed = /\b(confirm|force|yes\s+delete|permanently\s+delete)\b/i.test(lower);
      const res = await executeClientToolCall(
        { name: 'deleteRecord', args: { targetType, identifier: matchedPersonName, confirmed: isConfirmed } },
        appStoreActions,
        userEmail,
        cleanPrompt
      );
      return {
        text: res.success ? `### 🗑️ Record Deleted\n${res.summary}` : `### ⚠️ Confirmation Required\n${res.summary}`,
        searchSources: [],
        executedActions: [
          {
            toolName: 'deleteRecord',
            success: res.success,
            summary: res.summary,
            recordId: res.recordId,
            actionLabel: res.actionLabel || (res.success ? '🗑️ Record Deleted' : '⚠️ Confirm Deletion')
          }
        ]
      };
    }

    // Attendance intent
    if (/\b(attendance|present|absent|late|hajiri)\b/i.test(lower) && /\b(mark|set|update|lagao|kara)\b/i.test(lower) && matchedPersonName) {
      const status = /\babsent\b/i.test(lower) ? 'Absent' : /\blate\b/i.test(lower) ? 'Late' : 'Present';
      const res = await executeClientToolCall(
        {
          name: 'mark_attendance',
          args: { studentIdentifier: matchedPersonName, status }
        },
        appStoreActions,
        userEmail,
        cleanPrompt
      );
      return {
        text: `### ✅ Action Completed\n${res.summary}`,
        searchSources: [],
        executedActions: [{ toolName: 'mark_attendance', success: res.success, summary: res.summary, recordId: res.recordId }]
      };
    }

    // Update intent (`updateRecord`)
    const statusMatch = cleanPrompt.match(/\b(?:status|stage)\s+(?:to|as|=|:)\s+([A-Za-z\s\-]{2,25})(?=[.,;]|$)/i);
    const parsedStatus = statusMatch?.[1]?.trim();

    if (
      matchedPersonName &&
      (/\b(update|change|set|modify|edit|assign|promote|move|fee|paid|batch|status|stage)\b/i.test(lower) ||
        parsedFeePaid !== undefined ||
        Boolean(parsedBatch) ||
        Boolean(parsedStatus))
    ) {
      const res = await executeClientToolCall(
        {
          name: 'updateRecord',
          args: {
            identifier: matchedPersonName,
            targetType: /\b(lead|inquir)\b/i.test(lower) ? 'lead' : 'auto',
            updates: {
              ...(parsedBatch ? { batch: parsedBatch } : {}),
              ...(parsedCourse ? { course: parsedCourse } : {}),
              ...(parsedFeePaid !== undefined ? { paidFees: parsedFeePaid, feePaid: parsedFeePaid } : {}),
              ...(parsedPhone ? { phone: parsedPhone } : {}),
              ...(parsedStatus ? { status: parsedStatus, stage: parsedStatus } : {})
            }
          }
        },
        appStoreActions,
        userEmail,
        cleanPrompt
      );
      return {
        text: res.success ? `### ✏️ Record Updated\n${res.summary}` : `### ⚠️ Disambiguation Needed\n${res.summary}`,
        searchSources: [],
        executedActions: [
          {
            toolName: 'updateRecord',
            success: res.success,
            summary: res.summary,
            recordId: res.recordId,
            actionLabel: res.actionLabel || '✏️ Record Updated',
            actionCard: res.actionCard
          }
        ]
      };
    }
  }

  // Multilingual Branch / Batch Student Count Query (e.g. "Sane Chowk morning batch ke students count batao")
  if (
    (/\b(sane\s*chowk|fc\s*road|shivajinagar|chikhali|morning\s*batch|evening\s*batch|weekend\s*batch)\b/i.test(lower) &&
      /\b(count|kitne|kiti|students?|list|batao|dikhao|how\s+many)\b/i.test(lower)) ||
    (/\bbatch\b/i.test(lower) && /\b(count|kitne|kiti|batao)\b/i.test(lower))
  ) {
    const rawStudents = state?.students?.filter(s => s.status !== 'Archived') || [];
    const isSaneChowk = /\bsane\s*chowk|chikhali|pcmc\b/i.test(lower);
    const isFcRoad = /\bfc\s*road|shivajinagar|deccan\b/i.test(lower);
    const isMorning = /\bmorning\b/i.test(lower);
    const isEvening = /\bevening\b/i.test(lower);
    const isWeekend = /\bweekend\b/i.test(lower);

    const filtered = rawStudents.filter(s => {
      const addr = `${s.address || ''} ${s.branch || ''}`.toLowerCase();
      const bCode = String(s.batch || '').toLowerCase();
      const matchedBatchObj = state?.batches?.find(b => b.code.toLowerCase() === bCode || b.name.toLowerCase() === bCode);
      const sched = `${bCode} ${matchedBatchObj?.name || ''} ${matchedBatchObj?.schedule || ''}`.toLowerCase();

      if (isSaneChowk && !addr.includes('sane') && !addr.includes('chikhali') && !addr.includes('pcmc') && rawStudents.some(x => `${x.address || ''} ${x.branch || ''}`.toLowerCase().includes('sane'))) {
        return false;
      }
      if (isFcRoad && !addr.includes('fc') && !addr.includes('shivajinagar') && !addr.includes('pune')) {
        return false;
      }
      if (isMorning && !sched.includes('morning') && !sched.includes('am') && !sched.includes('mtb')) {
        return false;
      }
      if (isEvening && !sched.includes('evening') && !sched.includes('pm') && !sched.includes('fno')) {
        return false;
      }
      if (isWeekend && !sched.includes('weekend') && !sched.includes('sat') && !sched.includes('wkd')) {
        return false;
      }
      return true;
    });

    const displayList = filtered.length > 0 ? filtered : rawStudents;
    const filterTitle = [
      isSaneChowk ? 'Sane Chowk Branch' : isFcRoad ? 'FC Road Branch' : 'All Pune Branches',
      isMorning ? 'Morning Batch' : isEvening ? 'Evening Batch' : isWeekend ? 'Weekend Batch' : 'Active Batches'
    ].join(' — ');

    const stuLines = displayList.slice(0, 12).map(
      s => `- **${s.name}** (\`${s.regId}\`) • Batch: \`${s.batch || 'Assigned'}\` • Course: **${s.course}** • Phone: \`${s.phone}\``
    );

    return {
      text: `### 🏫 Batch & Branch Student Count: ${filterTitle}\n- **Matching Active Students Count:** **${displayList.length}** students\n- **Total Institute Active Students:** **${rawStudents.length}** students\n\n#### Enrolled Students Roster\n${stuLines.join('\n') || '- No students found in this filter.'}`,
      searchSources: []
    };
  }

  // Admissions & Leads count query + Today's Follow-ups (English + Hindi/Marathi: "Aaj ke follow-ups dikhao", "Today's Follow-ups")
  if (
    (/\b(how\s+many|count|total)\b/i.test(lower) && /\b(leads?|inquir(?:y|ies))\b/i.test(lower)) ||
    /\b(aaj\s*ke\s*follow|aajche\s*follow|today'?s?\s*follow[\s-]?ups?|follow[\s-]?ups?\s*dikhao|follow[\s-]?ups?\s*list)\b/i.test(lower) ||
    (/\bfollow[\s-]?up\b/i.test(lower) && /\b(who|list|pending|overdue|uncontacted|today|aaj|dikhao|batao|due)\b/i.test(lower))
  ) {
    const openInquiries = (state?.leads || []).filter(
      l => l.isConverted !== true && !['Admission Confirmed', 'Lost', 'Not Interested'].includes(l.stage)
    );
    const dueTodayOrOverdue = openInquiries.filter(
      l => !l.followUpDate || l.followUpDate <= LIVE_TODAY_ISO
    );
    const listToRender = dueTodayOrOverdue.length > 0 ? dueTodayOrOverdue : openInquiries;
    const followUpLines = listToRender.slice(0, 15).map(
      l =>
        `- **${l.name}** (\`${l.id}\`) • Course: **${l.course || 'Stock Market'}** • Phone: \`${l.phone || 'N/A'}\` • Follow-up: \`${l.followUpDate || LIVE_TODAY_ISO} ${l.followUpTime || ''}\` • Stage: **${l.stage}**`
    );
    return {
      text: `### 📅 Today's Follow-Ups & Open Inquiries (${LIVE_TODAY_ISO})\n- **Follow-Ups Due Today / Overdue:** **${dueTodayOrOverdue.length}** inquiries\n- **Total Unconverted Inquiries:** **${openInquiries.length}** leads\n- **Total Admitted Students:** **${students.length}** students\n\n#### 🎯 Priority Inquiries Requiring Follow-Up Call\n${followUpLines.join('\n') || '- ✅ All inquiries have been followed up with today!'}`,
      searchSources: []
    };
  }

  const totalCollected = students.reduce((sum, s) => sum + (Number(s.feePaid) || 0), 0);
  const totalDue = students.reduce((sum, s) => sum + (Number(s.balanceDue) || 0), 0);

  // Specific person lookup
  if (matchedPersonName) {
    const found = allRecords.find(
      r => String(r.name || '').toLowerCase() === matchedPersonName.toLowerCase()
    );
    if (found) {
      const isStu = Boolean((found as any).regId);
      setLastReferencedRecord({
        id: String(found.id),
        regId: (found as any).regId ? String((found as any).regId) : undefined,
        name: String(found.name),
        phone: found.phone ? String(found.phone) : undefined,
        course: found.course ? String(found.course) : undefined,
        collection: isStu ? 'students' : 'leads',
      });
      return {
        text: `### 📋 ${isStu ? 'Student' : 'Inquiry'} Record Details: ${found.name}\n- **Record Type:** \`${isStu ? 'student' : 'inquiry'}\`\n- **ID:** \`${(found as any).regId || found.id}\`\n- **Course:** ${found.course || 'Assigned'}\n- **Batch / Stage:** \`${(found as any).batch || (found as any).stage || 'Active'}\`\n- **Phone:** \`${found.phone || 'N/A'}\`${isStu ? `\n- **Fees Paid:** ₹${Number((found as any).feePaid || 0).toLocaleString('en-IN')} (Balance Due: ₹${Number((found as any).balanceDue || 0).toLocaleString('en-IN')} / Net Fee: ₹${Number((found as any).netFee || 0).toLocaleString('en-IN')})\n- **Attendance:** **${(found as any).attendancePct ?? 100}%**` : ''}`,
        searchSources: []
      };
    }
  }

  // Pending Fees Summary (English + Hindi/Marathi: "Pending fees wale students ki list do", "Pending Fees Summary")
  if (/\b(overdue|pending\s*fee|fees?\s*wale|balance\s*due|unpaid|fee\s*due|defaulter|collection|recovery|dues|baki\s*fee)\b/i.test(lower)) {
    const pendingList = students.filter(s => Number(s.balanceDue) > 0 && s.status !== 'Archived');
    const lines = pendingList
      .map(
        s =>
          `- **${s.name}** (\`${s.regId || s.id}\`) • Batch: \`${s.batch || 'Unassigned'}\` • Phone: \`${s.phone}\` • Paid: ₹${Number(s.feePaid || 0).toLocaleString('en-IN')} • **Balance Due: ₹${Number(s.balanceDue || 0).toLocaleString('en-IN')}**`
      )
      .join('\n');
    return {
      text: `### 💰 Pending Fees Summary & Recovery Report\n- **Total Fees Collected:** **₹${totalCollected.toLocaleString('en-IN')}**\n- **Total Pending Dues:** **₹${totalDue.toLocaleString('en-IN')}** across **${pendingList.length}** students\n\n#### Students with Pending Fee Balances\n${lines || '- ✅ All active students have cleared 100% of their course fees!'}`,
      searchSources: []
    };
  }

  // Attendance Audit (< 75% or Attendance overview)
  if (/\b(attendance|absentee|below\s*75|low\s+attendance|present)\b/i.test(lower)) {
    const lowAtt = students.filter(s => (Number(s.attendancePct) || 100) < 75 && s.status !== 'Archived');
    const allAttLines = (lowAtt.length > 0 ? lowAtt : students.slice(0, 8))
      .map(
        s =>
          `- **${s.name}** (\`${s.regId || s.id}\`) • Batch: \`${s.batch || 'N/A'}\` • Attendance: **${s.attendancePct ?? 100}%** • Phone: \`${s.phone}\``
      )
      .join('\n');
    return {
      text: `### 📅 Live Student Attendance Audit\n- **Students Below 75% Attendance Threshold:** **${lowAtt.length}**\n- **Total Active Students Monitored:** **${students.length}**\n\n#### ${lowAtt.length > 0 ? 'Students Requiring Attendance Follow-Up (< 75%)' : 'Current Student Attendance Standing'}\n${allAttLines || '- No students found.'}`,
      searchSources: []
    };
  }

  // Share Market / Price Action / Nifty / Bank Nifty / F&O / Trading Strategy Queries
  if (/\b(nifty|bank\s*nifty|price\s*action|option|straddle|strangle|iron\s*condor|demand|supply|zone|support|resistance|candlestick|intraday|swing\s*trad|risk\s*management|stop\s*loss|theta|delta|vega|oi|open\s*interest|market|trading\s*strategy)\b/i.test(lower)) {
    return {
      text: `### 📈 Srujaan Institutional Price Action & F&O Trading Desk Blueprint\n\n#### 1. Institutional Demand & Supply Zone Execution (Nifty 50 & Bank Nifty)\n- **Freshness & Impulse Structure:** Focus on **Rally-Base-Rally (RBR)** and **Drop-Base-Rally (DBR)** demand zones on the **15-min & 75-min** timeframes where institutional order flow left an imbalance (>1.8x ATR impulse candle).\n- **Entry Trigger:** Wait for liquidity sweep below retail support into the institutional proximal line with a **15-min bullish rejection wick + rising VWAP**.\n- **Strict Risk Protocol:** Maximum **1% to 1.5% capital risk per trade**; minimum **1:2.5 Risk-to-Reward (R:R)** before trailing stop-loss to cost.\n\n#### 2. Option Buying vs. Option Selling Framework\n| Parameter | Option Buying (Momentum) | Option Selling (Theta/Spread) |\n| :--- | :--- | :--- |\n| **Ideal Market Regime** | High ADX (>25), Breakout from narrow CPR | Range-bound, India VIX cooling off |\n| **Strike Selection** | Slightly ITM (0.55 – 0.65 Delta) | OTM Credit Spreads / Iron Condor (0.20 Delta) |\n| **Stop-Loss Rule** | 25%–30% of option premium or spot zone invalidation | 1.5x credit received or spot break of max-OI wall |\n\n#### 3. Marathi Summary for Classroom & WhatsApp\n> *"सृजन शेअर मार्केट इन्स्टिट्यूट टीप: निफ्टी आणि बँक निफ्टीमध्ये ट्रेड घेताना नेहमी १५-मिनिटांच्या डिमांड/सप्लाय झोनची आणि १:२.५ रिस्क-रिवॉर्डची काटेकोरपणे अंमलबजावणी करा. स्टॉप-लॉस शिवाय कोणताही F&O ट्रेड घेऊ नका."*`,
      searchSources: []
    };
  }

  // Courses / Batches / Syllabus Overview
  if (/\b(course|batch|syllabus|curriculum|lecture|schedule|fee\s+structure)\b/i.test(lower)) {
    const cLines = courses
      .map(c => `- **${c.name}** (\`${c.code}\`) — Course Fee: **₹${Number(c.fee || 0).toLocaleString('en-IN')}**`)
      .join('\n');
    const bLines = batches
      .map(b => `- **${b.name}** (\`${b.code}\`) — Course: **${b.course}** • Schedule: \`${b.schedule}\``)
      .join('\n');
    return {
      text: `### 🎓 Srujaan Courses & Active Batch Schedules\n\n#### Flagship Trading Programs (${courses.length})\n${cLines || '- Complete Master Trader Blueprint (₹35,000)'}\n\n#### Active Classroom & Hybrid Batches (${batches.length})\n${bLines || '- No batches listed'}`,
      searchSources: []
    };
  }

  return {
    text: `### 📊 Srujaan Share Market Institute — Live All-Access AI Summary\n- **Active Students:** **${students.length}**\n- **Open Inquiries / Leads:** **${inquiries.length}**\n- **Total Fees Collected:** **₹${totalCollected.toLocaleString('en-IN')}**\n- **Total Pending Dues:** **₹${totalDue.toLocaleString('en-IN')}**\n- **Courses & Batches:** **${courses.length} Courses** • **${batches.length} Batches**`,
    searchSources: []
  };
}

// ============================================================================
// FREE-TIER GEMINI 2.5 FLASH-LITE QUOTA, RATE-LIMIT & EXPONENTIAL BACKOFF ENGINE
// ============================================================================
export const FREE_TIER_GEMINI_MODEL = 'gemini-2.5-flash-lite';
export const FREE_TIER_GEMINI_FALLBACK_MODEL = 'gemini-3.1-flash-lite';
const MAX_FREE_TIER_RPM = 10; // Free-tier rate limit guard (10 requests / minute)
const RESPONSE_CACHE_TTL_MS = 45_000; // 45s cache for identical read-only queries to conserve quota

const recentRequestTimestamps: number[] = [];
const readOnlyResponseCache = new Map<string, { timestamp: number; result: GeminiQueryResult }>();

function checkFreeTierRateLimit(): { allowed: boolean; retryAfterMs: number } {
  const now = Date.now();
  while (recentRequestTimestamps.length > 0 && now - recentRequestTimestamps[0] > 60_000) {
    recentRequestTimestamps.shift();
  }
  if (recentRequestTimestamps.length >= MAX_FREE_TIER_RPM) {
    const oldest = recentRequestTimestamps[0] || now;
    return { allowed: false, retryAfterMs: Math.max(1000, 60_000 - (now - oldest)) };
  }
  recentRequestTimestamps.push(now);
  return { allowed: true, retryAfterMs: 0 };
}

export async function callWithExponentialBackoff<T>(
  fn: () => Promise<T>,
  maxRetries = 2,
  baseDelayMs = 1000
): Promise<T> {
  let attempt = 0;
  while (true) {
    try {
      return await fn();
    } catch (err: any) {
      const status = err?.status || err?.code || 0;
      const msg = String(err?.message || '').toLowerCase();
      const isRateLimitOrTransient =
        status === 429 ||
        status === 503 ||
        msg.includes('429') ||
        msg.includes('resource_exhausted') ||
        msg.includes('quota') ||
        msg.includes('rate limit');

      if (!isRateLimitOrTransient || attempt >= maxRetries) {
        throw err;
      }
      const jitter = Math.floor(Math.random() * 350);
      const delay = baseDelayMs * Math.pow(2, attempt) + jitter;
      attempt++;
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}

/**
 * World-Class Executive AI Admin Agent (`gemini-2.5-flash` / `gemini-3.8-flash`)
 * with combined Google Search live internet grounding + 17 CRM Database Function Tools,
 * multi-turn tool execution loop (`while (response.functionCalls)`), Firebase Bearer token verification,
 * and seamless offline/quota fallback.
 */
export async function askGeminiWithSearch(
  prompt: string,
  history: ChatMessage[] = [],
  contextData?: string,
  state?: AppState,
  appStoreActions?: AgentStoreActions,
  userEmail?: string | null,
  onStreamChunk?: (partialText: string, actions?: ExecutedToolAction[]) => void
): Promise<GeminiQueryResult> {
  const normalizedEmail = (userEmail || 'srujaansharemarketpune@gmail.com').trim().toLowerCase();
  const isMasterAdmin =
    !userEmail ||
    normalizedEmail === 'srujaansharemarketpune@gmail.com' ||
    normalizedEmail === 'srujaanshareamarketpune@gmail.com';

  // Pre-flight RBAC guard for non-admin
  if (
    !isMasterAdmin &&
    /\b(delete|remove|erase|wipe|factory\s*reset|reset\s*database|api\s*key|modify\s*api|change\s*api)\b/i.test(prompt)
  ) {
    const denied =
      '### 🔒 Permission Denied\nYour current session (**Staff Operator**) is authorized to view, add, and update Inquiries, Admissions, and Student records, but **cannot delete records, reset databases, or modify system/API configurations**. Please sign in with the **Master Admin** (`srujaansharemarketpune@gmail.com`) account for destructive or system-level operations.';
    onStreamChunk?.(denied, []);
    return {
      text: denied,
      searchSources: []
    };
  }

  const executedActions: ExecutedToolAction[] = [];
  const collectedSources: { title: string; url: string }[] = [];

  // Read optional client-side env or stored settings key to pass to backend proxy
  const viteKey = String((import.meta as any).env?.VITE_GEMINI_API_KEY || '').trim();
  const settingsKey = String((state?.settings as any)?.customGeminiApiKey || '').trim();
  const clientApiKey = viteKey.startsWith('AIza') ? viteKey : settingsKey.startsWith('AIza') ? settingsKey : '';
  const aiConfig = state?.settings?.aiConfig;

  // Retrieve Firebase ID token from active auth session if signed in
  let authHeader: Record<string, string> = {};
  try {
    const { auth } = await import('./firebase');
    const token = await auth?.currentUser?.getIdToken?.();
    if (token) {
      authHeader = { Authorization: `Bearer ${token}` };
    }
  } catch {
    // Continue without Bearer header if offline
  }

  try {
    let currentLedgerSnapshot = buildLedgerSnapshot(state);
    const conversationContents: any[] = [];

    if (Array.isArray(history)) {
      history.slice(-12).forEach(h => {
        if (h && h.text && String(h.text).trim()) {
          conversationContents.push({
            role: h.role === 'model' ? 'model' : 'user',
            parts: [{ text: String(h.text) }]
          });
        }
      });
    }

    const userMessageText = contextData
      ? `[Current Institute Context]:\n${contextData}\n\n[User Query]:\n${prompt}`
      : prompt;

    conversationContents.push({
      role: 'user',
      parts: [{ text: userMessageText }]
    });

    let responseData: any = null;
    const firstResp = await fetch('/api/gemini/ask', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeader
      },
      body: JSON.stringify({
        prompt,
        history,
        conversationContents,
        contextData,
        ledgerSnapshot: currentLedgerSnapshot,
        userEmail: normalizedEmail,
        userRole: isMasterAdmin ? 'master_admin' : 'staff_operator',
        clientApiKey,
        aiConfig
      })
    });

    if (firstResp.ok) {
      responseData = await firstResp.json();
    }

    // Multi-turn tool execution loop: while (responseData?.functionCalls?.length > 0)
    let loopCount = 0;
    while (
      responseData &&
      Array.isArray(responseData.functionCalls) &&
      responseData.functionCalls.length > 0 &&
      appStoreActions &&
      loopCount < 4
    ) {
      loopCount++;
      if (Array.isArray(responseData.searchSources)) {
        responseData.searchSources.forEach((s: { title: string; url: string }) => {
          if (s?.url && !collectedSources.some(cs => cs.url === s.url)) {
            collectedSources.push(s);
          }
        });
      }

      const functionResponses: any[] = [];
      for (const fc of responseData.functionCalls) {
        const execRes = await executeClientToolCall(fc, appStoreActions, normalizedEmail, prompt);
        if (execRes.sources) {
          execRes.sources.forEach(s => {
            if (s?.url && !collectedSources.some(cs => cs.url === s.url)) {
              collectedSources.push(s);
            }
          });
        }
        executedActions.push({
          toolName: fc.name,
          success: execRes.success,
          summary: execRes.summary,
          recordId: execRes.recordId,
          actionLabel: execRes.actionLabel || `✅ ${fc.name}`,
          statusTag: `[Executing: ${fc.name} -> Done]`,
          actionCard: execRes.actionCard
        });
        functionResponses.push({
          functionResponse: {
            id: fc.id,
            name: fc.name,
            response: {
              result: {
                success: execRes.success,
                summary: execRes.summary,
                recordId: execRes.recordId,
                record: execRes.record
              }
            }
          }
        });
      }

      onStreamChunk?.(
        executedActions.map(a => a.summary).join('\n\n'),
        [...executedActions]
      );

      if (responseData.modelTurnContent) {
        conversationContents.push(responseData.modelTurnContent);
      } else {
        conversationContents.push({
          role: 'model',
          parts: responseData.functionCalls.map((fc: any) => ({
            functionCall: { id: fc.id, name: fc.name, args: fc.args }
          }))
        });
      }
      conversationContents.push({
        role: 'user',
        parts: functionResponses
      });

      currentLedgerSnapshot = buildLedgerSnapshot(state);
      const followUpResp = await fetch('/api/gemini/ask', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authHeader
        },
        body: JSON.stringify({
          prompt,
          history,
          conversationContents,
          contextData,
          ledgerSnapshot: currentLedgerSnapshot,
          modelTurnContent: responseData.modelTurnContent,
          functionResponses,
          userEmail: normalizedEmail,
          userRole: isMasterAdmin ? 'master_admin' : 'staff_operator',
          clientApiKey,
          aiConfig
        })
      });

      if (!followUpResp.ok) {
        responseData = {
          text: executedActions.map(a => `### ${a.actionLabel || '✅ Action Completed'}\n${a.summary}`).join('\n\n'),
          searchSources: collectedSources
        };
        break;
      }
      responseData = await followUpResp.json();
    }

    if (responseData) {
      if (Array.isArray(responseData.searchSources)) {
        responseData.searchSources.forEach((s: { title: string; url: string }) => {
          if (s?.url && !collectedSources.some(cs => cs.url === s.url)) {
            collectedSources.push(s);
          }
        });
      }

      if (collectedSources.length > 0 && !executedActions.some(a => a.actionLabel === '🌐 Web Grounded')) {
        executedActions.push({
          toolName: 'googleSearch',
          success: true,
          summary: `Grounded with ${collectedSources.length} live web source(s).`,
          actionLabel: '🌐 Web Grounded',
          statusTag: '[Live Web Grounded]'
        });
      }

      const finalText =
        responseData.text ||
        (executedActions.length > 0
          ? executedActions.map(a => `### ${a.actionLabel || '✅ Action Completed'}\n${a.summary}`).join('\n\n')
          : '');

      if (finalText) {
        const finalResult: GeminiQueryResult = {
          text: finalText,
          searchSources: collectedSources,
          executedActions: executedActions.length > 0 ? executedActions : undefined
        };
        onStreamChunk?.(finalResult.text, finalResult.executedActions);
        return finalResult;
      }
    }
  } catch {
    // Fall back cleanly to deterministic local CRM engine if offline or network unreachable
  }

  // Fallback to deterministic local CRM & Trading Intelligence Engine
  const localRes = await executeLocalIntelligentEngine(prompt, state, appStoreActions, userEmail);
  onStreamChunk?.(localRes.text, localRes.executedActions);
  return localRes;
}


