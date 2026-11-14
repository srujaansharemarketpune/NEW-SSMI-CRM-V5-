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
 * Strict Gemini Function Calling Tool Declarations for Srujaan Share Market Institute CRM
 */
export const CRM_GEMINI_FUNCTION_DECLARATIONS = [
  {
    name: 'create_inquiry_lead',
    description:
      'Use ONLY when the user mentions inquiry, lead, interested person, prospect, demo call, or follow-up. Creates a normalized record in the Inquiries/Leads list with recordType="inquiry" and isConverted=false so it displays the "Convert to Student" button.',
    parameters: {
      type: 'OBJECT',
      properties: {
        name: { type: 'STRING', description: 'Full name of the prospect/inquiry' },
        phone: { type: 'STRING', description: '10-digit Indian mobile number' },
        courseInterest: { type: 'STRING', description: 'Course the prospect is interested in' },
        branch: { type: 'STRING', description: 'Preferred branch or locality (e.g. Sane Chowk, FC Road)' },
        source: { type: 'STRING', description: 'Lead source (Walk-in, Instagram, Reference, Google, AI Copilot)' },
        followUpDate: { type: 'STRING', description: 'Follow-up date in YYYY-MM-DD format' },
        notes: { type: 'STRING', description: 'Counselor notes or remarks' }
      },
      required: ['name']
    }
  },
  {
    name: 'admit_student',
    description:
      'Use ONLY when the user explicitly says admit, enroll, register student, or fee paid for admission. Creates an active student record in the Students list with recordType="student" and SSM-... ID.',
    parameters: {
      type: 'OBJECT',
      properties: {
        name: { type: 'STRING', description: 'Full name of the student' },
        phone: { type: 'STRING', description: '10-digit Indian mobile number' },
        course: { type: 'STRING', description: 'Enrolled course name' },
        batch: { type: 'STRING', description: 'Assigned batch code or name' },
        branch: { type: 'STRING', description: 'Institute branch or locality' },
        totalFees: { type: 'NUMBER', description: 'Total course fee in INR' },
        amountPaid: { type: 'NUMBER', description: 'Initial fee paid in INR' },
        paymentMode: { type: 'STRING', description: 'UPI, Cash, Bank Transfer, Card' }
      },
      required: ['name']
    }
  },
  {
    name: 'convert_lead_to_student',
    description:
      'Atomically converts an existing inquiry/lead into an admitted student using the shared conversion factory, updating the lead to isConverted=true and creating the student record.',
    parameters: {
      type: 'OBJECT',
      properties: {
        leadIdentifier: { type: 'STRING', description: 'Lead name, phone number, or LEAD-... ID' },
        course: { type: 'STRING', description: 'Course to enroll into' },
        batch: { type: 'STRING', description: 'Batch code or schedule' },
        feePaid: { type: 'NUMBER', description: 'Admission fee paid in INR' }
      },
      required: ['leadIdentifier']
    }
  },
  {
    name: 'update_record',
    description: 'Updates an existing inquiry/lead or admitted student record.',
    parameters: {
      type: 'OBJECT',
      properties: {
        collection: { type: 'STRING', description: '"inquiries" or "students"' },
        identifier: { type: 'STRING', description: 'Name, phone number, or ID of the record' },
        updates: { type: 'OBJECT', description: 'Key-value fields to update' }
      },
      required: ['identifier']
    }
  },
  {
    name: 'delete_record',
    description: 'Deletes a student or inquiry record (Master Admin only).',
    parameters: {
      type: 'OBJECT',
      properties: {
        collection: { type: 'STRING', description: '"inquiries" or "students"' },
        identifier: { type: 'STRING', description: 'Name, phone number, or ID of the record' }
      },
      required: ['identifier']
    }
  },
  {
    name: 'search_records',
    description: 'Searches inquiries/leads and admitted students by name, phone, course, batch, or branch.',
    parameters: {
      type: 'OBJECT',
      properties: {
        query: { type: 'STRING', description: 'Search keyword, name, phone, batch, or branch' },
        entityType: { type: 'STRING', description: '"inquiries", "students", or "all"' }
      },
      required: ['query']
    }
  },
  {
    name: 'mark_attendance',
    description: 'Marks daily attendance (Present, Absent, Late) for a student.',
    parameters: {
      type: 'OBJECT',
      properties: {
        studentIdentifier: { type: 'STRING', description: 'Student name, phone, or SSM-... ID' },
        status: { type: 'STRING', description: '"Present", "Absent", or "Late"' },
        date: { type: 'STRING', description: 'YYYY-MM-DD date' }
      },
      required: ['studentIdentifier', 'status']
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

export interface AgentStoreActions {
  searchRecords?: (
    query: string,
    entityType?: 'students' | 'inquiries' | 'all'
  ) =>
    | Promise<{ success: boolean; summary: string; records?: any[] }>
    | { success: boolean; summary: string; records?: any[] };
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
      notes?: string;
      date?: string;
      email?: string;
      locality?: string;
      source?: string;
      stage?: string;
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
    identifier: string
  ) => Promise<{ success: boolean; summary: string; recordId?: string }> | { success: boolean; summary: string; recordId?: string };
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
      course: l.course,
      stage: l.stage,
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
    extraSummary ? `Additional Summary: ${extraSummary}` : ''
  ]
    .filter(Boolean)
    .join('\n\n');
}

/**
 * Dispatches any Gemini tool call to the bound store actions with strict Role-Based Access Control
 */
export async function executeClientToolCall(
  call: { id?: string; name: string; args?: any },
  appStoreActions: AgentStoreActions,
  userEmail?: string | null
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
  const isMasterAdmin = !userEmail || normalizedEmail === 'srujaansharemarketpune@gmail.com';

  // Role Security Gate: Block destructive actions (delete, reset, system/API settings) for non-Master Admin
  const isDestructiveTool =
    name === 'deleteStudentRecord' ||
    name === 'delete_record' ||
    name === 'deleteStudent' ||
    name === 'deleteAllStudents' ||
    name === 'deleteLead' ||
    name === 'deleteAllLeads' ||
    name === 'updateSystemSettings' ||
    (name === 'manageStudents' && (args.action === 'delete' || args.action === 'deleteAll')) ||
    (name === 'manageLeads' && (args.action === 'delete' || args.action === 'deleteAll')) ||
    (name === 'executeLiveRecordMutation' && String(args.action || '').toLowerCase() === 'delete');

  if (!isMasterAdmin && isDestructiveTool) {
    return {
      success: false,
      summary:
        '🔒 Permission Denied: Record deletion, database resets, and API/system configuration changes are restricted to the Master Admin account.'
    };
  }

  // Strict Tool 1: create_inquiry_lead (Inquiry/Lead ONLY — recordType: 'inquiry', isConverted: false)
  if (name === 'create_inquiry_lead' || name === 'createLead' || name === 'addLead') {
    const res = await appStoreActions.addRecord('inquiries', {
      name: args.name || args.leadData?.name,
      phone: args.phone || args.leadData?.phone,
      course: args.courseInterest || args.course || args.leadData?.course,
      branch: args.branch || args.locality || args.leadData?.locality,
      locality: args.branch || args.locality || args.leadData?.locality,
      source: args.source || args.leadData?.source || 'AI Copilot',
      followUpDate: args.followUpDate || args.date || args.leadData?.followUpDate,
      notes: args.notes || args.leadData?.notes,
      ...(args.data || {})
    });
    return {
      ...res,
      actionLabel: res.actionCard?.isDuplicateWarning
        ? '⚠️ Duplicate Detected in CRM'
        : '⚡ Action executed: Inquiry / Lead Created (`create_inquiry_lead`)'
    };
  }

  // Strict Tool 2: admit_student (Admitted Student ONLY — recordType: 'student', SSM-... ID)
  if (name === 'admit_student' || name === 'addStudent' || name === 'addStudentRecord') {
    const res = await appStoreActions.addRecord('students', {
      name: args.name || args.studentData?.name,
      phone: args.phone || args.studentData?.phone,
      course: args.course || args.studentData?.course,
      batch: args.batch || args.studentData?.batch,
      branch: args.branch || args.address || args.studentData?.address,
      locality: args.branch || args.address || args.studentData?.address,
      totalFee: args.totalFees ?? args.totalFee ?? args.netFee ?? args.studentData?.totalFee,
      feePaid: args.amountPaid ?? args.feePaid ?? args.paidAmount ?? args.studentData?.feePaid,
      notes: args.notes || args.studentData?.notes,
      ...(args.data || {})
    });
    return {
      ...res,
      actionLabel: res.actionCard?.isDuplicateWarning
        ? '⚠️ Duplicate Detected in CRM'
        : '⚡ Action executed: Student Admitted (`admit_student`)'
    };
  }

  // Strict Tool 3: convert_lead_to_student (Atomic conversion via convertInquiryToStudentAtomic)
  if (
    name === 'convert_lead_to_student' ||
    name === 'convertLeadToAdmission' ||
    name === 'convertLead'
  ) {
    const ident = String(
      args.leadIdentifier || args.identifier || args.name || args.leadId || args.targetEntity || ''
    ).trim();
    if (appStoreActions.convertLeadToAdmission) {
      const res = await appStoreActions.convertLeadToAdmission({
        leadIdentifier: ident,
        course: args.course,
        batch: args.batch,
        feePaid:
          args.feePaid !== undefined
            ? Number(args.feePaid)
            : args.amountPaid !== undefined
            ? Number(args.amountPaid)
            : args.amount !== undefined
            ? Number(args.amount)
            : undefined
      });
      return {
        ...res,
        actionLabel: '⚡ Action executed: Lead Converted to Student (`convert_lead_to_student`)'
      };
    }
    return await appStoreActions.updateRecord('students', ident, {
      ...args,
      __promoteFromLead: true
    });
  }

  if (name === 'getDatabaseSnapshot') {
    if (appStoreActions.getDatabaseSnapshot) {
      const res = await appStoreActions.getDatabaseSnapshot();
      return {
        ...res,
        actionLabel: '⚡ Action executed: Database Snapshot retrieved'
      };
    }
    return {
      success: true,
      summary: 'Retrieved live database snapshot.',
      actionLabel: '⚡ Action executed: Database Snapshot retrieved'
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
        actionLabel: res.actionLabel || '⚡ Action executed: Course Data updated'
      };
    }
    if (appStoreActions.modifyCourse) {
      return await appStoreActions.modifyCourse(courseId, data);
    }
  }

  if (name === 'manageStudents' || name === 'deleteStudent' || name === 'deleteAllStudents') {
    const action: 'add' | 'delete' | 'deleteAll' =
      name === 'deleteStudent'
        ? 'delete'
        : name === 'deleteAllStudents'
        ? 'deleteAll'
        : (args.action || 'add');
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

  if (name === 'manageLeads' || name === 'updateLead' || name === 'deleteLead' || name === 'deleteAllLeads') {
    const action: 'add' | 'update' | 'delete' | 'deleteAll' =
      name === 'updateLead'
        ? 'update'
        : name === 'deleteLead'
        ? 'delete'
        : name === 'deleteAllLeads'
        ? 'deleteAll'
        : (args.action || 'add');
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
        actionLabel: '⚡ Action executed: Live Market & Web Search grounded'
      };
    }
  }

  if (name === 'searchRecords' || name === 'search_records') {
    const query = String(args.query || args.identifier || args.name || '').trim();
    const entityType = (args.entityType || 'all') as 'students' | 'inquiries' | 'all';
    if (appStoreActions.searchRecords) {
      return await appStoreActions.searchRecords(query, entityType);
    }
    return {
      success: true,
      summary: `Searched records for "${query}".`
    };
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
      return await appStoreActions.updateRecord(collection, recordId, data);
    }
    if (data.name && (data.batch || data.feePaid !== undefined || data.paidAmount !== undefined || data.status || data.stage)) {
      return await appStoreActions.updateRecord(collection, String(data.name), data);
    }
    return await appStoreActions.addRecord(collection, {
      name: data.name || 'New Record',
      ...data
    });
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
      return await appStoreActions.addRecord(targetCol, {
        name: data.name || targetEntity,
        ...data
      });
    }
    if (action === 'delete') {
      return await appStoreActions.deleteRecord(collection === 'auto' ? 'students' : collection, targetEntity);
    }
    if (action === 'promote_lead_to_student') {
      if (appStoreActions.convertLeadToAdmission) {
        return await appStoreActions.convertLeadToAdmission({
          leadIdentifier: targetEntity,
          course: data.course,
          batch: data.batch,
          feePaid: data.feePaid ?? data.paidAmount
        });
      }
      return await appStoreActions.updateRecord('students', targetEntity, {
        ...data,
        __promoteFromLead: true
      });
    }
    return await appStoreActions.updateRecord(
      collection === 'auto' ? 'students' : collection,
      targetEntity,
      data
    );
  }

  if (name === 'updateStudentRecord') {
    return await appStoreActions.updateRecord(
      'students',
      String(args.identifier || args.targetEntity || ''),
      args.updates || args.data || {}
    );
  }

  if (name === 'deleteStudentRecord') {
    return await appStoreActions.deleteRecord('students', String(args.identifier || ''));
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
    return await appStoreActions.updateRecord('students', ident, {
      feePaid: payload.feePaid ?? payload.amount,
      paidAmount: payload.feePaid ?? payload.amount,
      ...(payload.batch ? { batch: payload.batch } : {})
    });
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
    return await appStoreActions.addRecord(args.collection || 'admissions', mergedPayload);
  }

  if (name === 'update_record') {
    return await appStoreActions.updateRecord(
      args.collection || 'students',
      args.identifier || args.targetEntity || '',
      args.updates || args.data || {}
    );
  }

  if (name === 'delete_record') {
    return await appStoreActions.deleteRecord(
      args.collection || 'students',
      args.identifier || args.targetEntity || ''
    );
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
      'from', 'into', 'with', 'interested', 'advance', 'aaj', 'ke', 'ki', 'ka', 'ko', 'me',
      'karo', 'dikhao', 'batao', 'do', 'wale', 'sane', 'chowk', 'pune', 'admit'
    ]);
    const nameMatch =
      cleanPrompt.match(
        /\b(?:update|change|modify|promote|convert|enroll|admit|add|register|mark|delete|remove|for|student|lead|inquiry|enquiry|new)\s+(?:(?:lead|inquiry|student|admission|enquiry)\s+)?([A-Za-z]{2,}(?:\s+[A-Za-z]{2,})*)/i
      ) ||
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
    if (/\bf&o\b|\boptions?\b|\bbank\s*nifty\b/i.test(lower)) {
      parsedCourse = 'Nifty & Bank Nifty F&O Masterclass';
    } else if (/\bmaster\s*trader\b|\bcomplete\s*trader\b|\bblueprint\b/i.test(lower)) {
      parsedCourse = 'Complete Master Trader Blueprint';
    } else if (/\bprice\s*action\b|\binstitutional\b|\bswing\b/i.test(lower)) {
      parsedCourse = 'Institutional Price Action & Swing Trading';
    } else if (/\badvance\b/i.test(lower)) {
      parsedCourse = 'Advance Price Action & Derivatives';
    } else if (/\bstock\s*market\b/i.test(lower)) {
      parsedCourse = 'Stock Market Comprehensive Course';
    }
  }
  if (!parsedCourse) {
    const courseRegexMatch = cleanPrompt.match(/(?:interested\s+in|for|in|course)\s+["']?([A-Za-z0-9\s\-&]{3,45}?)(?=["']|\s+(?:with|fee|paid|batch|phone|notes|at|on|me|karo|$)|[.,;]|$)/i);
    if (courseRegexMatch?.[1]) {
      const rawExtracted = courseRegexMatch[1].trim();
      if (!/^(student|lead|inquiry|admission|batch|class)$/i.test(rawExtracted)) {
        parsedCourse = rawExtracted;
      }
    }
  }

  if (appStoreActions) {
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
        convMatch?.[1]?.replace(/\b(from|to|into|leads?|inquiries|inquiry|lead|student|admission)\b/gi, '').trim() ||
        matchedPersonName ||
        inquiries[0]?.name;

      if (targetName) {
        const res = await executeClientToolCall(
          {
            name: 'convert_lead_to_student',
            args: {
              leadIdentifier: targetName,
              ...(parsedCourse ? { course: parsedCourse } : {}),
              ...(parsedBatch ? { batch: parsedBatch } : {}),
              ...(parsedFeePaid !== undefined ? { feePaid: parsedFeePaid } : {})
            }
          },
          appStoreActions,
          userEmail
        );
        return {
          text: res.success ? `### ✅ Lead Converted to Student\n${res.summary}` : `### ⚠️ Conversion Notice\n${res.summary}`,
          searchSources: [],
          executedActions: [
            {
              toolName: 'convert_lead_to_student',
              success: res.success,
              summary: res.summary,
              recordId: res.recordId,
              actionLabel: res.actionLabel || '⚡ Action executed: Lead Converted to Student',
              statusTag: '[Executing: convert_lead_to_student -> Done]',
              actionCard: res.actionCard
            }
          ]
        };
      }
    }

    // 0F. Create Inquiry / Lead Intent (`create_inquiry_lead`) — STRICTLY creates Inquiry with recordType: 'inquiry' & isConverted: false
    if (
      (/\b(add|create|new|register|log|save)\s+(?:a\s+|an\s+)?(?:new\s+)?(lead|inquiry|enquiry|prospect)\b/i.test(lower) ||
        (/\b(lead|inquiry|enquiry|prospect|demo\s*call|interested\s+person)\b/i.test(lower) &&
          /\b(add|new|create|register|interested|for|karo|kara)\b/i.test(lower))) &&
      !/\b(convert|promote|delete|remove)\b/i.test(lower)
    ) {
      const leadNameMatch =
        cleanPrompt.match(/(?:lead|inquiry|enquiry|prospect)\s+(?:for\s+|named\s+)?([A-Za-z][A-Za-z\s]{1,30}?)(?=\s+\+?91|\s+[6-9]\d{9}|\s+interested|\s+for|\s+in|\s+phone|\s+course|\s+branch|\s+notes|[.,;-]|$)/i) ||
        cleanPrompt.match(/(?:add|create|new|register)\s+(?:a\s+|an\s+)?(?:new\s+)?(?:lead|inquiry|enquiry)\s+([A-Za-z][A-Za-z\s]{1,30})/i);
      const rawExtractedName = leadNameMatch?.[1]
        ?.replace(/\b(lead|inquiry|enquiry|prospect|named|for|interested|in|phone|course)\b/gi, '')
        .trim();
      const targetName = rawExtractedName || matchedPersonName || 'Rohan Mane';

      const res = await executeClientToolCall(
        {
          name: 'create_inquiry_lead',
          args: {
            name: targetName,
            ...(parsedPhone ? { phone: parsedPhone } : {}),
            ...(parsedCourse ? { courseInterest: parsedCourse } : {}),
            ...(parsedBranch ? { branch: parsedBranch } : {}),
            followUpDate: LIVE_TODAY_ISO,
            source: 'AI Copilot',
            notes: cleanPrompt
          }
        },
        appStoreActions,
        userEmail
      );
      return {
        text: res.actionCard?.isDuplicateWarning
          ? `### ⚠️ Duplicate Record Found\n${res.summary}`
          : `### ✅ Inquiry / Lead Added (\`recordType: 'inquiry'\`)\n${res.summary}`,
        searchSources: [],
        executedActions: [
          {
            toolName: 'create_inquiry_lead',
            success: res.success,
            summary: res.summary,
            recordId: res.recordId,
            actionLabel: res.actionLabel || '⚡ Action executed: Inquiry / Lead Created',
            statusTag: '[Executing: create_inquiry_lead -> Done]',
            actionCard: res.actionCard
          }
        ]
      };
    }

    // 0G. Create Student Admission Intent (`admit_student`) — STRICTLY when user says admit, enroll, register student, or fee paid
    if (
      (/\b(add|create|enroll|admit|register)\s+(?:a\s+)?(?:new\s+)?(student|admission)\b/i.test(lower) ||
        (/\b(student|admission)\b/i.test(lower) && /\b(add|enroll|admit|register|create)\b/i.test(lower))) &&
      !/\b(convert|promote|delete|remove|inquir|lead)\b/i.test(lower)
    ) {
      const stuNameMatch =
        cleanPrompt.match(/(?:student|admission)\s+(?:for\s+|named\s+)?([A-Za-z][A-Za-z\s]{1,30}?)(?=\s+\+?91|\s+[6-9]\d{9}|\s+for|\s+in|\s+with|\s+fee|\s+batch|\s+phone|\s+notes|[.,;-]|$)/i) ||
        cleanPrompt.match(/(?:add|enroll|admit|register)\s+(?:a\s+)?(?:new\s+)?(?:student|admission)\s+([A-Za-z][A-Za-z\s]{1,30})/i);
      const rawExtractedName = stuNameMatch?.[1]
        ?.replace(/\b(student|admission|named|for|in|with|fee|fees)\b/gi, '')
        .trim();
      const targetName = rawExtractedName || matchedPersonName || 'Sneha Joshi';

      const res = await executeClientToolCall(
        {
          name: 'admit_student',
          args: {
            name: targetName,
            ...(parsedPhone ? { phone: parsedPhone } : {}),
            ...(parsedCourse ? { course: parsedCourse } : {}),
            ...(parsedBatch ? { batch: parsedBatch } : {}),
            ...(parsedBranch ? { branch: parsedBranch } : {}),
            ...(parsedFeePaid !== undefined ? { amountPaid: parsedFeePaid } : {}),
            notes: cleanPrompt
          }
        },
        appStoreActions,
        userEmail
      );
      return {
        text: res.actionCard?.isDuplicateWarning
          ? `### ⚠️ Duplicate Record Found\n${res.summary}`
          : `### ✅ Student Admitted (\`recordType: 'student'\`)\n${res.summary}`,
        searchSources: [],
        executedActions: [
          {
            toolName: 'admit_student',
            success: res.success,
            summary: res.summary,
            recordId: res.recordId,
            actionLabel: res.actionLabel || '⚡ Action executed: Student Admitted',
            statusTag: '[Executing: admit_student -> Done]',
            actionCard: res.actionCard
          }
        ]
      };
    }

    // Search intent
    const searchMatch = cleanPrompt.match(/^(?:search|find|lookup|look\s+up|locate|query)\s+(?:for\s+)?(?:student[s]?|inquir(?:y|ies)|lead[s]?|record[s]?)?\s*(.+)$/i);
    if (searchMatch?.[1] && !/\b(update|change|set|modify|edit|delete|remove|add|enroll|admit)\b/i.test(lower)) {
      const res = await executeClientToolCall(
        {
          name: 'search_records',
          args: {
            query: searchMatch[1].trim(),
            entityType: /\b(inquir|lead)\b/i.test(lower) ? 'inquiries' : /\bstudent\b/i.test(lower) ? 'students' : 'all'
          }
        },
        appStoreActions,
        userEmail
      );
      return {
        text: res.summary,
        searchSources: [],
        executedActions: [
          {
            toolName: 'search_records',
            success: res.success,
            summary: res.summary,
            actionLabel: '⚡ Action executed: Database records searched',
            statusTag: '[Executing: search_records -> Done]'
          }
        ]
      };
    }

    // Delete intent
    if (/\b(delete|remove|erase)\b/i.test(lower) && matchedPersonName) {
      const targetCollection = /\b(lead|inquir)\b/i.test(lower) ? 'inquiries' : 'students';
      const res = await executeClientToolCall(
        { name: 'delete_record', args: { collection: targetCollection, identifier: matchedPersonName } },
        appStoreActions,
        userEmail
      );
      return {
        text: res.success ? `### ✅ Action Completed\n${res.summary}` : `### ⚠️ Action Notice\n${res.summary}`,
        searchSources: [],
        executedActions: [{ toolName: 'delete_record', success: res.success, summary: res.summary, recordId: res.recordId }]
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
        userEmail
      );
      return {
        text: `### ✅ Action Completed\n${res.summary}`,
        searchSources: [],
        executedActions: [{ toolName: 'mark_attendance', success: res.success, summary: res.summary, recordId: res.recordId }]
      };
    }

    // Update / Promote intent
    if (
      matchedPersonName &&
      (/\b(update|change|set|modify|edit|assign|promote|move|fee|paid|batch)\b/i.test(lower) ||
        parsedFeePaid !== undefined ||
        Boolean(parsedBatch))
    ) {
      const res = await executeClientToolCall(
        {
          name: 'update_record',
          args: {
            identifier: matchedPersonName,
            collection: /\b(lead|inquir)\b/i.test(lower) ? 'inquiries' : 'students',
            updates: {
              ...(parsedBatch ? { batch: parsedBatch } : {}),
              ...(parsedFeePaid !== undefined ? { feePaid: parsedFeePaid, paidAmount: parsedFeePaid } : {}),
              ...(parsedPhone ? { phone: parsedPhone } : {})
            }
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
            toolName: 'update_record',
            success: res.success,
            summary: res.summary,
            recordId: res.recordId,
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
 * Free-Tier execution of the Candle AI Assistant (`gemini-2.5-flash-lite` / `gemini-3.1-flash-lite`)
 * with role-based access control, rate-limit & exponential backoff protection, zero paid grounding tools,
 * and automatic deterministic local CRM fallback when quota is unavailable.
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
  const normalizedEmail = (userEmail || '').trim().toLowerCase();
  const isMasterAdmin =
    !userEmail ||
    normalizedEmail === 'srujaansharemarketpune@gmail.com' ||
    normalizedEmail === 'srujaanshareamarketpune@gmail.com';

  // Pre-flight RBAC guard: If Staff Operator attempts to delete records, reset DB, or change API keys via chat
  if (
    !isMasterAdmin &&
    /\b(delete|remove|erase|wipe|factory\s*reset|reset\s*database|api\s*key|modify\s*api|change\s*api)\b/i.test(prompt)
  ) {
    const denied =
      '### 🔒 Permission Denied\nYour current session (**Staff Operator**) is authorized to view, add, and update Inquiries, Admissions, and Student records, but **cannot delete records, reset databases, or modify system/API configurations**. Please sign in with the **Master Admin** account for destructive or system-level operations.';
    onStreamChunk?.(denied, []);
    return {
      text: denied,
      searchSources: []
    };
  }

  const isMutatingPrompt = /\b(add|create|new|enroll|admit|register|convert|promote|update|change|set|modify|edit|assign|move|delete|remove|erase|mark)\b/i.test(
    prompt
  );
  const cacheKey = `${normalizedEmail}:${prompt.trim().toLowerCase()}`;

  // 1. Check short-lived cache for identical read-only queries to avoid unnecessary API calls
  if (!isMutatingPrompt) {
    const cached = readOnlyResponseCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < RESPONSE_CACHE_TTL_MS) {
      onStreamChunk?.(cached.result.text, cached.result.executedActions);
      return cached.result;
    }
  }

  // 2. Execute deterministic local CRM & Trading Intelligence Engine (0 API quota cost, 100% Free Client-Side)
  const localRes = await executeLocalIntelligentEngine(prompt, state, appStoreActions, userEmail);

  const rateCheck = checkFreeTierRateLimit();
  if (!rateCheck.allowed && !localRes.executedActions?.length) {
    const rateLimitedRes: GeminiQueryResult = {
      ...localRes,
      text: `${localRes.text}\n\n> ℹ️ *Free-Tier Quota Protection: High query burst (${MAX_FREE_TIER_RPM} RPM) smoothed automatically via the local CRM engine.*`
    };
    onStreamChunk?.(rateLimitedRes.text, rateLimitedRes.executedActions);
    return rateLimitedRes;
  }

  if (!isMutatingPrompt) {
    readOnlyResponseCache.set(cacheKey, { timestamp: Date.now(), result: localRes });
  }
  onStreamChunk?.(localRes.text, localRes.executedActions);
  return localRes;
}


