import { Lead, Student, Batch, AppState } from '../types';

/* =========================================================================
   1. GOOGLE FORMS API INTEGRATION
   ========================================================================= */

function extractGoogleFormId(input: string): string {
  const value = String(input || '').trim();
  if (!value) throw new Error('Please provide a Google Form URL or ID.');
  const match = value.match(/\/forms\/d\/(?:e\/)?([^/?#]+)/i);
  const id = match?.[1] || value.split(/[/?#]/)[0];
  if (!id || id.length < 10) throw new Error('The Google Form URL or ID is invalid.');
  return id;
}

export interface GoogleFormQuestion {
  questionId: string;
  title: string;
}

export interface GoogleFormInfo {
  formId: string;
  title: string;
  description: string;
  responderUri?: string;
  questions: GoogleFormQuestion[];
}

export async function fetchGoogleFormMetadata(formId: string, accessToken: string): Promise<GoogleFormInfo> {
  const cleanId = extractGoogleFormId(formId);
  const res = await fetch(`https://forms.googleapis.com/v1/forms/${cleanId}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    }
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `Failed to fetch Google Form (${res.status})`);
  }

  const data = await res.json();
  const questions: GoogleFormQuestion[] = [];
  (data.items || []).forEach((item: any) => {
    if (item.questionItem?.question) {
      questions.push({
        questionId: item.questionItem.question.questionId,
        title: item.title || 'Untitled Field'
      });
    }
  });

  return {
    formId: data.formId,
    title: data.info?.title || 'Google Form',
    description: data.info?.description || '',
    responderUri: data.responderUri,
    questions
  };
}

export async function fetchGoogleFormResponses(formId: string, accessToken: string): Promise<any[]> {
  const cleanId = extractGoogleFormId(formId);
  const res = await fetch(`https://forms.googleapis.com/v1/forms/${cleanId}/responses`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    }
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `Failed to fetch Google Form Responses (${res.status})`);
  }

  const data = await res.json();
  return data.responses || [];
}

export function parseFormResponsesIntoLeads(
  formInfo: GoogleFormInfo,
  responses: any[],
  existingLeads: Lead[]
): { newLeads: Lead[]; duplicatesCount: number } {
  const newLeads: Lead[] = [];
  let duplicatesCount = 0;

  // Identify question IDs by matching title keywords
  const nameQ = formInfo.questions.find(q => /name|full name|student/i.test(q.title))?.questionId;
  const phoneQ = formInfo.questions.find(q => /phone|mobile|whatsapp|contact/i.test(q.title))?.questionId;
  const emailQ = formInfo.questions.find(q => /email/i.test(q.title))?.questionId;
  const courseQ = formInfo.questions.find(q => /course|program|track|subject/i.test(q.title))?.questionId;
  const localityQ = formInfo.questions.find(q => /city|area|location|locality/i.test(q.title))?.questionId;

  responses.forEach((resp: any, idx: number) => {
    const answers = resp.answers || {};

    const getAnswerText = (qid?: string) => {
      if (!qid || !answers[qid]) return '';
      const textAnswers = answers[qid].textAnswers?.answers || [];
      return textAnswers.map((a: any) => a.value).join(', ');
    };

    const name = getAnswerText(nameQ) || `Prospect ${idx + 1}`;
    let phone = getAnswerText(phoneQ).replace(/\D/g, '');
    if (phone.length > 10) phone = phone.slice(-10);
    const email = getAnswerText(emailQ);
    const course = getAnswerText(courseQ) || 'Complete Master Trader Blueprint';
    const locality = getAnswerText(localityQ) || 'Pune';

    if (phone && existingLeads.some(l => l.phone.includes(phone))) {
      duplicatesCount++;
      return;
    }

    const today = new Date().toISOString().split('T')[0];
    newLeads.push({
      id: `LEAD-GF-${Date.now()}-${idx}`,
      name,
      phone: phone || '9822000000',
      email,
      locality,
      course,
      stage: 'New Enquiry',
      intent: 'Hot',
      enquiryDate: today,
      followUpDate: today,
      followUpTime: '17:30',
      lastContact: today,
      source: `Google Form: ${formInfo.title}`,
      mode: 'Offline Classroom',
      staff: 'Anjali Deshmukh',
      objection: 'Awaiting first counselor connect',
      notes: `Submitted via Google Form (${resp.responseId || 'Direct'})`
    });
  });

  return { newLeads, duplicatesCount };
}

/* =========================================================================
   2. GOOGLE SHEETS API INTEGRATION
   ========================================================================= */

export async function createGoogleSpreadsheet(title: string, accessToken: string): Promise<string> {
  const res = await fetch('https://sheets.googleapis.com/v4/spreadsheets', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      properties: { title: title || 'Srujaan Institute Database' },
      sheets: [
        { properties: { title: 'Students' } },
        { properties: { title: 'Leads CRM' } },
        { properties: { title: 'Batches' } },
        { properties: { title: 'Fees' } }
      ]
    })
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `Failed to create Google Spreadsheet (${res.status})`);
  }

  const data = await res.json();
  return data.spreadsheetId;
}

export async function ensureSheetsExist(
  spreadsheetId: string,
  sheetTitles: string[],
  accessToken: string
): Promise<void> {
  const cleanId = spreadsheetId.replace(/^https:\/\/docs\.google\.com\/spreadsheets\/d\//, '').split('/')[0].trim();
  try {
    const metaRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${cleanId}?fields=sheets.properties.title`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    if (!metaRes.ok) return;
    const meta = await metaRes.json();
    const existingTitles = (meta.sheets || []).map((s: any) => s.properties?.title);
    const missing = sheetTitles.filter(t => !existingTitles.includes(t));

    if (missing.length > 0) {
      const requests = missing.map(title => ({
        addSheet: { properties: { title } }
      }));
      await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${cleanId}:batchUpdate`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ requests })
      });
    }
  } catch (err) {
    console.warn('ensureSheetsExist warning:', err);
  }
}

export async function syncAllToGoogleSheets(
  spreadsheetId: string,
  state: AppState,
  accessToken: string
): Promise<{ spreadsheetId: string; spreadsheetUrl: string; studentsCount: number; leadsCount: number }> {
  let cleanId = spreadsheetId ? spreadsheetId.replace(/^https:\/\/docs\.google\.com\/spreadsheets\/d\//, '').split('/')[0].trim() : '';

  // If no spreadsheet ID provided, automatically create one
  if (!cleanId) {
    cleanId = await createGoogleSpreadsheet('Srujaan Institute — Students & Leads Export', accessToken);
  }

  // Ensure tabs exist
  await ensureSheetsExist(cleanId, ['Students', 'Leads CRM'], accessToken);

  // Prepare Students Data with formatted headers
  const studentRows = [
    ['Student ID', 'Full Name', 'Phone', 'WhatsApp', 'Email', 'Address', 'Course Track', 'Batch Code', 'Enrollment Status', 'Gross Fee (₹)', 'Discount (₹)', 'Net Fee (₹)', 'Paid Amount (₹)', 'Pending Balance (₹)', 'Enrollment Date', 'Counselor Notes'],
    ...state.students.map(s => {
      const paid = (s.milestones || []).filter(m => m.status === 'Paid').reduce((a, b) => a + b.amount, 0);
      return [
        s.regId,
        s.name,
        s.phone,
        s.whatsapp,
        s.email || '—',
        s.address || 'Pune',
        s.course,
        s.batch || 'Unassigned',
        s.status,
        s.grossFee,
        s.discount,
        s.netFee,
        paid,
        Math.max(0, s.netFee - paid),
        s.enrollDate,
        s.notes || ''
      ];
    })
  ];

  // Prepare Leads Data
  const leadRows = [
    ['Lead ID', 'Prospect Name', 'Phone', 'Email', 'Locality in Pune', 'Course Interest', 'Pipeline Stage', 'Intent Priority', 'Follow-up Date & Time', 'Lead Source', 'Preferred Mode', 'Assigned Counselor', 'Primary Objection / Notes'],
    ...state.leads.map(l => [
      l.id,
      l.name,
      l.phone,
      l.email || '—',
      l.locality || 'Pune',
      l.course,
      l.stage,
      l.intent,
      `${l.followUpDate} ${l.followUpTime || ''}`.trim(),
      l.source,
      l.mode || 'Offline Classroom',
      l.staff || 'Admissions Desk',
      l.objection || l.notes || ''
    ])
  ];

  const updateRange = async (range: string, values: any[][]) => {
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${cleanId}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`;
    const res = await fetch(url, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ range, majorDimension: 'ROWS', values })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error?.message || `Failed to update sheet range ${range}`);
    }
  };

  await updateRange('Students!A1:P', studentRows);
  await updateRange('Leads CRM!A1:M', leadRows);

  return {
    spreadsheetId: cleanId,
    spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${cleanId}/edit`,
    studentsCount: state.students.length,
    leadsCount: state.leads.length
  };
}

/* =========================================================================
   3. GOOGLE TASKS API INTEGRATION
   ========================================================================= */

export interface GoogleTaskItem {
  id?: string;
  title: string;
  notes?: string;
  due?: string; // RFC 3339 timestamp
  status?: 'needsAction' | 'completed';
}

export async function fetchGoogleTaskLists(accessToken: string): Promise<{ id: string; title: string }[]> {
  const res = await fetch('https://tasks.googleapis.com/tasks/v1/users/@me/lists', {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `Failed to fetch Google Task lists (${res.status})`);
  }
  const data = await res.json();
  return (data.items || []).map((i: any) => ({ id: i.id, title: i.title }));
}

export async function fetchGoogleTasks(taskListId: string, accessToken: string): Promise<GoogleTaskItem[]> {
  const res = await fetch(`https://tasks.googleapis.com/tasks/v1/lists/${taskListId}/tasks`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  if (!res.ok) return [];
  const data = await res.json();
  return (data.items || []).map((t: any) => ({
    id: t.id,
    title: t.title,
    notes: t.notes || '',
    due: t.due || '',
    status: t.status
  }));
}

export async function createGoogleTask(
  taskListId: string,
  task: { title: string; notes?: string; due?: string },
  accessToken: string
): Promise<GoogleTaskItem> {
  const res = await fetch(`https://tasks.googleapis.com/tasks/v1/lists/${taskListId}/tasks`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(task)
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `Failed to create task (${res.status})`);
  }

  return await res.json();
}

export async function completeGoogleTask(
  taskListId: string,
  taskId: string,
  accessToken: string
): Promise<void> {
  await fetch(`https://tasks.googleapis.com/tasks/v1/lists/${taskListId}/tasks/${taskId}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ status: 'completed' })
  });
}

/* =========================================================================
   4. GOOGLE DOCS & DRIVE API INTEGRATION
   ========================================================================= */

export interface GoogleDocFileItem {
  id: string;
  name: string;
  modifiedTime?: string;
  webViewLink?: string;
}

export interface GoogleDocDetail {
  documentId: string;
  title: string;
  bodyText: string;
  revisionId?: string;
  documentUrl: string;
}

/**
 * Extracts plain text from a Google Docs `body.content` structural elements array.
 */
export function extractPlainTextFromGoogleDoc(docData: any): string {
  const content = docData?.body?.content;
  if (!Array.isArray(content)) return '';
  const chunks: string[] = [];
  const walkElements = (elements: any[]) => {
    for (const el of elements) {
      if (el?.paragraph?.elements) {
        for (const pe of el.paragraph.elements) {
          if (pe?.textRun?.content) {
            chunks.push(String(pe.textRun.content));
          }
        }
      } else if (el?.table?.tableRows) {
        for (const row of el.table.tableRows) {
          for (const cell of row.tableCells || []) {
            if (Array.isArray(cell.content)) {
              walkElements(cell.content);
            }
          }
          chunks.push('\n');
        }
      }
    }
  };
  walkElements(content);
  return chunks.join('').trim();
}

/**
 * Lists Google Docs files from the user's Google Drive using Drive v3 API.
 */
export async function fetchGoogleDocsList(accessToken: string, pageSize = 20): Promise<GoogleDocFileItem[]> {
  const q = encodeURIComponent("mimeType='application/vnd.google-apps.document' and trashed=false");
  const fields = encodeURIComponent('files(id,name,modifiedTime,webViewLink)');
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${q}&pageSize=${pageSize}&orderBy=modifiedTime desc&fields=${fields}`,
    {
      headers: { Authorization: `Bearer ${accessToken}` }
    }
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `Failed to list Google Docs (${res.status})`);
  }
  const data = await res.json();
  return (data.files || []).map((f: any) => ({
    id: String(f.id),
    name: String(f.name || 'Untitled Document'),
    modifiedTime: f.modifiedTime || '',
    webViewLink: f.webViewLink || `https://docs.google.com/document/d/${f.id}/edit`
  }));
}

/**
 * Reads a Google Doc's full title and plain-text content via Google Docs v1 API.
 */
export async function fetchGoogleDocContent(documentIdOrUrl: string, accessToken: string): Promise<GoogleDocDetail> {
  const cleanId = documentIdOrUrl
    .replace(/^https:\/\/docs\.google\.com\/document\/d\//, '')
    .split('/')[0]
    .trim();
  if (!cleanId) {
    throw new Error('Please provide a valid Google Document ID or URL.');
  }
  const res = await fetch(`https://docs.googleapis.com/v1/documents/${cleanId}`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `Failed to read Google Doc (${res.status})`);
  }
  const data = await res.json();
  return {
    documentId: data.documentId || cleanId,
    title: data.title || 'Untitled Document',
    bodyText: extractPlainTextFromGoogleDoc(data),
    revisionId: data.revisionId,
    documentUrl: `https://docs.google.com/document/d/${data.documentId || cleanId}/edit`
  };
}

/**
 * Creates a new Google Doc and populates it with formatted institute report text via `:batchUpdate`.
 */
export async function createGoogleDocReport(
  title: string,
  reportText: string,
  accessToken: string
): Promise<GoogleDocDetail> {
  const createRes = await fetch('https://docs.googleapis.com/v1/documents', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ title: title.trim() || 'Srujaan Institute Report' })
  });
  if (!createRes.ok) {
    const err = await createRes.json().catch(() => ({}));
    throw new Error(err.error?.message || `Failed to create Google Doc (${createRes.status})`);
  }
  const created = await createRes.json();
  const docId = created.documentId;

  if (reportText.trim()) {
    const updateRes = await fetch(`https://docs.googleapis.com/v1/documents/${docId}:batchUpdate`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        requests: [
          {
            insertText: {
              location: { index: 1 },
              text: reportText
            }
          }
        ]
      })
    });
    if (!updateRes.ok) {
      const err = await updateRes.json().catch(() => ({}));
      throw new Error(err.error?.message || `Created doc ${docId} but failed to insert content (${updateRes.status})`);
    }
  }

  return {
    documentId: docId,
    title: created.title || title,
    bodyText: reportText,
    documentUrl: `https://docs.google.com/document/d/${docId}/edit`
  };
}

/**
 * Appends text to an existing Google Doc (Mutating action — callers must confirm with user first).
 */
export async function appendTextToGoogleDoc(
  documentIdOrUrl: string,
  textToAppend: string,
  accessToken: string
): Promise<GoogleDocDetail> {
  const cleanId = documentIdOrUrl
    .replace(/^https:\/\/docs\.google\.com\/document\/d\//, '')
    .split('/')[0]
    .trim();
  if (!cleanId) {
    throw new Error('Invalid Google Document ID.');
  }
  const res = await fetch(`https://docs.googleapis.com/v1/documents/${cleanId}:batchUpdate`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      requests: [
        {
          insertText: {
            endOfSegmentLocation: { segmentId: '' },
            text: `\n${textToAppend}`
          }
        }
      ]
    })
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `Failed to update Google Doc (${res.status})`);
  }
  return await fetchGoogleDocContent(cleanId, accessToken);
}

/**
 * Deletes/trashes a Google Doc file via Drive v3 API (Destructive action — callers must confirm with user first).
 */
export async function deleteGoogleDocFile(documentId: string, accessToken: string): Promise<void> {
  const cleanId = documentId.trim();
  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${cleanId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  if (!res.ok && res.status !== 204) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `Failed to delete Google Doc (${res.status})`);
  }
}

/**
 * Generates a structured Srujaan Share Market Institute Executive Summary text for exporting to Google Docs.
 */
export function buildInstituteReportTextForGoogleDoc(state: AppState): string {
  const nowStr = new Date().toLocaleString('en-IN', { hour12: false });
  const activeStudents = (state.students || []).filter(s => s.status !== 'Archived');
  const totalProjected = activeStudents.reduce((acc, s) => acc + (Number(s.netFee) || 0), 0);
  const totalCollected = activeStudents.reduce((acc, s) => {
    const paid = (s.milestones || []).filter(m => m.status === 'Paid').reduce((a, b) => a + (Number(b.amount) || 0), 0);
    return acc + paid;
  }, 0);
  const totalPending = Math.max(0, totalProjected - totalCollected);

  const lines: string[] = [
    `${state.settings?.instituteName || 'Srujaan Share Market Institute'} — Executive CRM & Academic Report`,
    `Generated At: ${nowStr}`,
    `Campus: ${state.settings?.campusAddress || 'Pune'}`,
    `==========================================================================`,
    ``,
    `1. EXECUTIVE KPI SUMMARY`,
    `• Active Enrolled Students: ${activeStudents.length}`,
    `• Total CRM Inquiries / Leads: ${(state.leads || []).length}`,
    `• Active Batches: ${(state.batches || []).filter(b => b.status === 'Active').length}`,
    `• Total Net Projected Fees: ₹${totalProjected.toLocaleString('en-IN')}`,
    `• Total Realized Collections: ₹${totalCollected.toLocaleString('en-IN')}`,
    `• Pending Fee Receivables: ₹${totalPending.toLocaleString('en-IN')}`,
    ``,
    `2. ENROLLED STUDENT ROSTER (${activeStudents.length})`,
    ...activeStudents.map((s, idx) => {
      const paid = (s.milestones || []).filter(m => m.status === 'Paid').reduce((a, b) => a + (Number(b.amount) || 0), 0);
      const due = Math.max(0, (Number(s.netFee) || 0) - paid);
      return `${idx + 1}. ${s.name} (${s.regId}) | Phone: ${s.phone} | Course: ${s.course} | Batch: ${s.batch || 'Unassigned'} | Paid: ₹${paid.toLocaleString('en-IN')} | Due: ₹${due.toLocaleString('en-IN')}`;
    }),
    ``,
    `3. ACTIVE LEAD PIPELINE (${(state.leads || []).length})`,
    ...(state.leads || []).map((l, idx) => {
      return `${idx + 1}. ${l.name} (${l.id}) | Phone: ${l.phone} | Stage: ${l.stage} | Course: ${l.course} | Follow-Up: ${l.followUpDate || 'N/A'}`;
    }),
    ``
  ];
  return lines.join('\n');
}

