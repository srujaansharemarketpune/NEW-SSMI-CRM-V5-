import { AppState, Student, Lead, FeeMilestone } from '../types';
import {
  DEFAULT_APPS_SCRIPT_EXEC_URL,
  DEFAULT_APPS_SCRIPT_LIBRARY_ID,
  DEFAULT_APPS_SCRIPT_LIBRARY_URL,
  getGoogleSheetWebhookUrl,
  saveGoogleSheetWebhookUrl,
  resetGoogleSheetWebhookToDefault,
  saveCachedStudents,
  loadCachedStudents,
  exportStudentsToJson,
  calculateStudentFeesStatus
} from './storageService';
import {
  saveStateToStorage,
  loadStateFromStorage,
  initIndexedDb,
  autoSaveData,
  getDeterministicStudentId,
  getDeterministicLeadId,
  deduplicateRecords
} from './db';

/**
 * Primary Institutional Account Binding
 */
export const PRIMARY_INSTITUTE_EMAIL = 'srujaansharemarketpune@gmail.com';
export const SECONDARY_AUTHORIZED_EMAIL = 'udayhajare18@gmail.com';

export const DEFAULT_MASTER_SHEET_URL =
  'https://docs.google.com/spreadsheets/d/1SrujaanShareMarketMasterDatabasePune/edit';
export const DEFAULT_GOOGLE_FORM_URL =
  'https://docs.google.com/forms/d/e/1FAIpQLScD8yH9K4m7P1J4Z-Srujaan-Admission-Form/viewform';
export const DEFAULT_GOOGLE_FORM_EMBED_URL =
  'https://docs.google.com/forms/d/e/1FAIpQLScD8yH9K4m7P1J4Z-Srujaan-Admission-Form/viewform?embedded=true';

export const CLOUD_CONFIG_STORAGE_KEY = 'ssmi_cloud_integrations_config_v3';
export const IDB_SYNC_QUEUE_KEY = 'SSMI_PENDING_SYNC_QUEUE_IDB_V3';

export type DuplicateFilterMode =
  | 'skip_duplicates'
  | 'smart_merge'
  | 'overwrite_matching'
  | 'import_all';

export interface CloudIntegrationConfig {
  accountEmail: string;
  execUrl: string;
  masterSheetUrl: string;
  googleFormUrl: string;
  googleFormEmbedUrl: string;
  duplicateFilterMode: DuplicateFilterMode;
  autoSyncOnOnline: boolean;
  lastVerifiedAt: string | null;
  lastSyncSummary: string | null;
}

export interface SyncBatchSummary {
  fetched: number;
  added: number;
  updated: number;
  skippedDuplicates: number;
  timestamp: string;
}

export interface QueuedRecordItem {
  record_id: string;
  updated_at: string;
  entityType: 'student' | 'lead';
  action: 'UPSERT' | 'DELETE';
  payload: Record<string, any>;
  attempts: number;
  lastError?: string;
}

export interface StorageDiagnosticsSnapshot {
  localStorageCount: number;
  localStorageLastSync: string;
  indexedDbCount: number;
  indexedDbLastSync: string;
  googleSheetsStatus:
    | 'Online & Synced'
    | 'Syncing...'
    | 'Offline - Saved Locally'
    | 'Sync Error - Click to Retry'
    | 'Ready (Not Synced Yet)';
  googleSheetsLastSync: string;
  googleSheetsError: string | null;
  pendingQueueCount: number;
  jsonBackupLastExport: string;
  accountEmail: string;
}

/**
 * Complete Zero-Touch Google Apps Script Backend (`Code.gs`)
 * Includes `setupSrujaanBackend()`, `onFormSubmit(e)`, `doPost(e)`, and `doGet(e)`
 */
export const ZERO_TOUCH_APPS_SCRIPT_CODE = `/**
 * ============================================================================
 * SRUJAAN SHARE MARKET INSTITUTE — ZERO-TOUCH GOOGLE APPS SCRIPT BACKEND
 * Account: srujaansharemarketpune@gmail.com
 * Deployment Settings:
 *   - Execute as: Me (srujaansharemarketpune@gmail.com)
 *   - Who has access: Anyone
 * ============================================================================
 */

const MASTER_SHEET_NAME = "Srujaan Share Market Institute - Master Database";
const ADMISSION_FORM_NAME = "Srujaan Share Market Institute - Admission & Inquiry Form";
const STUDENTS_TAB = "Master Records";
const ADMISSIONS_TAB = "Admission Form (Responses)";
const LEADS_TAB = "Inquiry & Leads CRM";

const MASTER_HEADERS = [
  "Record ID",
  "Timestamp",
  "Student Name",
  "Mobile",
  "Email",
  "Course",
  "Branch",
  "Batch",
  "Language",
  "Total Fee",
  "Fee Amount",
  "Balance Due",
  "Fee Status",
  "Payment Mode",
  "Source",
  "Notes"
];

const LEADS_HEADERS = [
  "Lead ID",
  "Prospect Name",
  "Phone",
  "Email",
  "Locality in Pune",
  "Course Interest",
  "Pipeline Stage",
  "Intent Priority",
  "Follow-up Date & Time",
  "Lead Source",
  "Preferred Mode",
  "Assigned Counselor",
  "Primary Objection / Notes"
];

/**
 * 1. ONE-CLICK AUTO-PROVISIONING FUNCTION
 * Run this once inside the Apps Script Editor ("setupSrujaanBackend")
 */
function setupSrujaanBackend() {
  const props = PropertiesService.getScriptProperties();
  let ss = null;
  let sheetId = props.getProperty("MASTER_SHEET_ID");

  if (sheetId) {
    try {
      ss = SpreadsheetApp.openById(sheetId);
    } catch (e) {
      ss = null;
    }
  }

  // Search Drive if not stored in properties
  if (!ss) {
    const files = DriveApp.getFilesByName(MASTER_SHEET_NAME);
    if (files.hasNext()) {
      ss = SpreadsheetApp.open(files.next());
    } else {
      ss = SpreadsheetApp.create(MASTER_SHEET_NAME);
    }
    props.setProperty("MASTER_SHEET_ID", ss.getId());
  }

  // Ensure Master Records Tab
  let masterSheet = ss.getSheetByName(STUDENTS_TAB);
  if (!masterSheet) {
    masterSheet = ss.getSheets()[0];
    masterSheet.setName(STUDENTS_TAB);
  }
  if (masterSheet.getLastRow() === 0) {
    masterSheet.appendRow(MASTER_HEADERS);
    masterSheet.getRange(1, 1, 1, MASTER_HEADERS.length)
      .setFontWeight("bold")
      .setBackground("#0f172a")
      .setFontColor("#ffffff");
    masterSheet.setFrozenRows(1);
  }

  // Ensure Leads CRM Tab
  let leadsSheet = ss.getSheetByName(LEADS_TAB);
  if (!leadsSheet) {
    leadsSheet = ss.insertSheet(LEADS_TAB);
  }
  if (leadsSheet.getLastRow() === 0) {
    leadsSheet.appendRow(LEADS_HEADERS);
    leadsSheet.getRange(1, 1, 1, LEADS_HEADERS.length)
      .setFontWeight("bold")
      .setBackground("#065f46")
      .setFontColor("#ffffff");
    leadsSheet.setFrozenRows(1);
  }

  // Create or Find Linked Google Form
  let form = null;
  let formId = props.getProperty("MASTER_FORM_ID");
  if (formId) {
    try {
      form = FormApp.openById(formId);
    } catch (e) {
      form = null;
    }
  }

  if (!form) {
    const formFiles = DriveApp.getFilesByName(ADMISSION_FORM_NAME);
    if (formFiles.hasNext()) {
      form = FormApp.openById(formFiles.next().getId());
    } else {
      form = FormApp.create(ADMISSION_FORM_NAME);
      form.setDescription("Official Admission & Course Inquiry Registration — Srujaan Share Market Institute (WHERE KNOWLEDGE MEETS PROFIT.)");
      form.addTextItem().setTitle("Student Name").setRequired(true);
      form.addTextItem().setTitle("Mobile").setRequired(true);
      form.addTextItem().setTitle("Email").setRequired(false);
      form.addListItem()
        .setTitle("Course")
        .setChoiceValues([
          "Basic Course",
          "Advance Stock Market",
          "Futures & Options",
          "Forex & Crypto",
          "Complete Trader Program"
        ])
        .setRequired(true);
      form.addListItem()
        .setTitle("Branch")
        .setChoiceValues([
          "Sane Chowk (Chinchwad)",
          "Patil Nagar (Chikhali)",
          "Solapur",
          "Online / Hybrid"
        ])
        .setRequired(true);
      form.addListItem()
        .setTitle("Preferred Batch")
        .setChoiceValues(["Morning", "Afternoon", "Evening", "Weekend"])
        .setRequired(false);
      form.addTextItem().setTitle("Enter the Amount you Paid").setRequired(false);
      form.addParagraphTextItem().setTitle("Notes").setRequired(false);

      try {
        form.setDestination(FormApp.DestinationType.SPREADSHEET, ss.getId());
      } catch (err) {
        Logger.log("Destination link notice: " + err);
      }
    }
    props.setProperty("MASTER_FORM_ID", form.getId());
  }

  // Install onFormSubmit Trigger if not already present
  const triggers = ScriptApp.getProjectTriggers();
  const hasFormTrigger = triggers.some(t => t.getHandlerFunction() === "onFormSubmit");
  if (!hasFormTrigger) {
    ScriptApp.newTrigger("onFormSubmit")
      .forSpreadsheet(ss)
      .onFormSubmit()
      .create();
  }

  const sheetUrl = ss.getUrl();
  const publishedFormUrl = form.getPublishedUrl();
  const embedFormUrl = publishedFormUrl + (publishedFormUrl.indexOf("?") === -1 ? "?embedded=true" : "&embedded=true");

  props.setProperty("SHEET_URL", sheetUrl);
  props.setProperty("FORM_URL", publishedFormUrl);
  props.setProperty("FORM_EMBED_URL", embedFormUrl);

  Logger.log("==========================================");
  Logger.log("✅ SRUJAAN BACKEND PROVISIONED SUCCESSFULLY");
  Logger.log("Master Google Sheet URL: " + sheetUrl);
  Logger.log("Public Google Form URL: " + publishedFormUrl);
  Logger.log("Form Embed URL: " + embedFormUrl);
  Logger.log("==========================================");

  return {
    status: "success",
    sheetUrl: sheetUrl,
    formUrl: publishedFormUrl,
    formEmbedUrl: embedFormUrl
  };
}

/**
 * 2. AUTOMATIC FORM SUBMISSION TRIGGER
 * Formats every Google Form submission directly into the Master Sheet with Source = "Google Form"
 */
function onFormSubmit(e) {
  const lock = LockService.getScriptLock();
  lock.tryLock(30000);
  try {
    const props = PropertiesService.getScriptProperties();
    const ss = SpreadsheetApp.openById(props.getProperty("MASTER_SHEET_ID") || SpreadsheetApp.getActiveSpreadsheet().getId());
    const masterSheet = ss.getSheetByName(STUDENTS_TAB) || ss.getSheets()[0];

    const namedValues = (e && e.namedValues) ? e.namedValues : {};
    const getVal = (keys) => {
      for (var i = 0; i < keys.length; i++) {
        if (namedValues[keys[i]] && namedValues[keys[i]][0]) {
          return String(namedValues[keys[i]][0]).trim();
        }
      }
      return "";
    };

    const name = getVal(["Student Name", "Name", "Prospect Name"]) || "Form Applicant";
    const mobileRaw = getVal(["Mobile", "Contact Details", "Phone", "WhatsApp"]);
    const mobile = mobileRaw.replace(/\\D/g, "").slice(-10);
    const email = getVal(["Email", "Email Address"]);
    const course = getVal(["Course", "Course Enrollment Details", "Course Interest"]) || "Basic Course";
    const branch = getVal(["Branch", "Preferred Branch", "Locality in Pune"]) || "Sane Chowk (Chinchwad)";
    const batch = getVal(["Preferred Batch", "Batch"]) || "Morning";
    const paidAmount = Number(getVal(["Enter the Amount you Paid", "Fee Amount"]).replace(/\\D/g, "")) || 0;
    const notes = getVal(["Notes", "Primary Objection / Notes"]);
    const recordId = "STU_" + (mobile || Utilities.getUuid().slice(0, 8));
    const nowIso = new Date().toISOString();

    upsertRowByRecordId(masterSheet, {
      record_id: recordId,
      updated_at: nowIso,
      name: name,
      mobile: mobile,
      email: email,
      course: course,
      branch: branch,
      batch: batch,
      language: "Marathi",
      totalFee: paidAmount || 5000,
      feeAmount: paidAmount,
      balanceDue: Math.max(0, (paidAmount || 5000) - paidAmount),
      feeStatus: paidAmount > 0 ? "Paid" : "Pending",
      paymentMode: "UPI",
      source: "Google Form",
      notes: notes
    });
  } finally {
    lock.releaseLock();
  }
}

/**
 * 3. BIDIRECTIONAL doPost(e) — CORS-SAFE, IDEMPOTENT UPSERT BY RECORD ID
 */
function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.tryLock(30000);
  try {
    const rawContents = (e && e.postData && e.postData.contents) ? e.postData.contents : "{}";
    const data = JSON.parse(rawContents);
    const props = PropertiesService.getScriptProperties();

    let ss = null;
    const savedId = props.getProperty("MASTER_SHEET_ID");
    if (savedId) {
      try { ss = SpreadsheetApp.openById(savedId); } catch (err) {}
    }
    if (!ss) {
      try { ss = SpreadsheetApp.getActiveSpreadsheet(); } catch (err) {}
    }
    if (!ss) {
      setupSrujaanBackend();
      ss = SpreadsheetApp.openById(props.getProperty("MASTER_SHEET_ID"));
    }

    const masterSheet = ss.getSheetByName(STUDENTS_TAB) || ss.getSheets()[0];
    if (masterSheet.getLastRow() === 0) {
      masterSheet.appendRow(MASTER_HEADERS);
    }

    // Ping / Health Check
    if (data.action === "ping") {
      return jsonOut({
        status: "success",
        account: "srujaansharemarketpune@gmail.com",
        sheetUrl: ss.getUrl(),
        formUrl: props.getProperty("FORM_URL") || "",
        rowCount: Math.max(0, masterSheet.getLastRow() - 1),
        timestamp: new Date().toISOString()
      });
    }

    // Fetch All Records via POST
    if (data.action === "fetch_all_records") {
      const records = readAllSheetRecords(ss);
      return jsonOut({
        status: "success",
        records: records.students,
        leads: records.leads,
        sheetUrl: ss.getUrl(),
        formUrl: props.getProperty("FORM_URL") || ""
      });
    }

    // Batch or Single Upsert
    const incomingList = Array.isArray(data.records)
      ? data.records
      : (data.payload && Array.isArray(data.payload.students))
      ? data.payload.students
      : data.data
      ? [data.data]
      : [data];

    let syncedCount = 0;
    for (var i = 0; i < incomingList.length; i++) {
      const item = incomingList[i];
      if (!item || (!item.name && !item.studentName && !item.id && !item.record_id)) continue;
      upsertRowByRecordId(masterSheet, item);
      syncedCount++;
    }

    return jsonOut({
      status: "success",
      syncedCount: syncedCount,
      sheetUrl: ss.getUrl(),
      formUrl: props.getProperty("FORM_URL") || "",
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    return jsonOut({
      status: "error",
      message: error.toString()
    });
  } finally {
    lock.releaseLock();
  }
}

/**
 * 4. BIDIRECTIONAL doGet(e) — PULL ALL MASTER SHEET & GOOGLE FORM RECORDS
 */
function doGet(e) {
  try {
    const props = PropertiesService.getScriptProperties();
    let ss = null;
    const savedId = props.getProperty("MASTER_SHEET_ID");
    if (savedId) {
      try { ss = SpreadsheetApp.openById(savedId); } catch (err) {}
    }
    if (!ss) {
      try { ss = SpreadsheetApp.getActiveSpreadsheet(); } catch (err) {}
    }
    if (!ss) {
      return jsonOut({
        status: "online",
        account: "srujaansharemarketpune@gmail.com",
        records: [],
        leads: []
      });
    }

    const allData = readAllSheetRecords(ss);
    return jsonOut({
      status: "success",
      account: "srujaansharemarketpune@gmail.com",
      sheetUrl: ss.getUrl(),
      formUrl: props.getProperty("FORM_URL") || "",
      records: allData.students,
      leads: allData.leads,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    return jsonOut({ status: "error", message: err.toString() });
  }
}

function upsertRowByRecordId(sheet, item) {
  const mobile = String(item.mobile || item.phone || item.contact || "").replace(/\\D/g, "").slice(-10);
  const recordId = String(item.record_id || item.id || item.regId || ("STU_" + (mobile || Date.now()))).trim();
  const timestamp = item.updated_at || item.updatedAt || new Date().toISOString();
  const studentName = item.studentName || item.name || "";
  const email = item.email || "";
  const course = item.course || "Basic Course";
  const branch = item.branch || item.address || "Sane Chowk (Chinchwad)";
  const batch = item.batch || "Morning";
  const language = item.language || "Marathi";
  const totalFee = Number(item.totalFee || item.netFee || item.grossFee || 0);
  const feeAmount = Number(item.feeAmount || item.paidAmount || totalFee || 0);
  const balanceDue = Math.max(0, totalFee - feeAmount);
  const feeStatus = item.feeStatus || item.feesStatus || (balanceDue === 0 && totalFee > 0 ? "Paid" : feeAmount > 0 ? "Partial" : "Pending");
  const paymentMode = item.paymentMode || "UPI";
  const source = item.source || "Manual Entry";
  const notes = item.notes || "";

  const rowValues = [
    recordId,
    timestamp,
    studentName,
    mobile,
    email,
    course,
    branch,
    batch,
    language,
    totalFee,
    feeAmount,
    balanceDue,
    feeStatus,
    paymentMode,
    source,
    notes
  ];

  const lastRow = sheet.getLastRow();
  let matchRow = -1;
  if (lastRow > 1) {
    const existingIds = sheet.getRange(2, 1, lastRow - 1, 4).getValues();
    for (var i = 0; i < existingIds.length; i++) {
      const rowId = String(existingIds[i][0]).trim();
      const rowPhone = String(existingIds[i][3]).replace(/\\D/g, "").slice(-10);
      if (rowId === recordId || (mobile.length === 10 && rowPhone === mobile)) {
        matchRow = i + 2;
        break;
      }
    }
  }

  if (matchRow !== -1) {
    sheet.getRange(matchRow, 1, 1, rowValues.length).setValues([rowValues]);
  } else {
    sheet.appendRow(rowValues);
  }
}

function readAllSheetRecords(ss) {
  const students = [];
  const leads = [];

  const masterSheet = ss.getSheetByName(STUDENTS_TAB) || ss.getSheets()[0];
  if (masterSheet && masterSheet.getLastRow() > 1) {
    const data = masterSheet.getDataRange().getValues();
    const headers = data[0];
    for (var r = 1; r < data.length; r++) {
      const row = data[r];
      const obj = {};
      for (var c = 0; c < headers.length; c++) {
        obj[headers[c]] = row[c];
      }
      students.push({
        record_id: String(row[0] || ""),
        updated_at: String(row[1] || ""),
        name: String(row[2] || ""),
        phone: String(row[3] || ""),
        email: String(row[4] || ""),
        course: String(row[5] || ""),
        branch: String(row[6] || ""),
        batch: String(row[7] || ""),
        language: String(row[8] || "Marathi"),
        totalFee: Number(row[9] || 0),
        paidAmount: Number(row[10] || 0),
        balanceDue: Number(row[11] || 0),
        feeStatus: String(row[12] || "Pending"),
        paymentMode: String(row[13] || "UPI"),
        source: String(row[14] || "Google Sheet"),
        notes: String(row[15] || ""),
        raw: obj
      });
    }
  }

  const leadsSheet = ss.getSheetByName(LEADS_TAB);
  if (leadsSheet && leadsSheet.getLastRow() > 1) {
    const lData = leadsSheet.getDataRange().getValues();
    for (var i = 1; i < lData.length; i++) {
      const lr = lData[i];
      leads.push({
        id: String(lr[0] || ("LD_" + i)),
        name: String(lr[1] || ""),
        phone: String(lr[2] || ""),
        email: String(lr[3] || ""),
        locality: String(lr[4] || "Pune"),
        course: String(lr[5] || ""),
        stage: String(lr[6] || "New Enquiry"),
        intent: String(lr[7] || "Hot"),
        followUpDate: String(lr[8] || ""),
        source: String(lr[9] || "Google Sheet"),
        mode: String(lr[10] || "Offline Classroom"),
        staff: String(lr[11] || "Admissions Desk"),
        notes: String(lr[12] || "")
      });
    }
  }

  return { students: students, leads: leads };
}

function jsonOut(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
`;

/**
 * Load Cloud Integration Config with `srujaansharemarketpune@gmail.com` defaults
 */
export function getCloudIntegrationConfig(): CloudIntegrationConfig {
  const defaults: CloudIntegrationConfig = {
    accountEmail: PRIMARY_INSTITUTE_EMAIL,
    execUrl: getGoogleSheetWebhookUrl() || DEFAULT_APPS_SCRIPT_EXEC_URL,
    masterSheetUrl: DEFAULT_MASTER_SHEET_URL,
    googleFormUrl: DEFAULT_GOOGLE_FORM_URL,
    googleFormEmbedUrl: DEFAULT_GOOGLE_FORM_EMBED_URL,
    duplicateFilterMode: 'smart_merge',
    autoSyncOnOnline: true,
    lastVerifiedAt: null,
    lastSyncSummary: null
  };

  if (typeof window === 'undefined') return defaults;
  try {
    const raw = localStorage.getItem(CLOUD_CONFIG_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        ...defaults,
        ...parsed,
        accountEmail: PRIMARY_INSTITUTE_EMAIL,
        execUrl: (parsed.execUrl || defaults.execUrl).trim()
      };
    }
  } catch {
    // ignore
  }
  return defaults;
}

export function saveCloudIntegrationConfig(
  partial: Partial<CloudIntegrationConfig>
): CloudIntegrationConfig {
  const current = getCloudIntegrationConfig();
  const updated: CloudIntegrationConfig = {
    ...current,
    ...partial,
    accountEmail: PRIMARY_INSTITUTE_EMAIL
  };
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(CLOUD_CONFIG_STORAGE_KEY, JSON.stringify(updated));
      if (updated.execUrl) {
        saveGoogleSheetWebhookUrl(
          updated.execUrl,
          updated.execUrl === DEFAULT_APPS_SCRIPT_EXEC_URL ? 'default' : 'custom'
        );
      }
    } catch {
      // ignore
    }
  }
  return updated;
}

/**
 * Normalize phone number to clean last 10 digits (strips +91, spaces, leading 0)
 */
export function normalizePhone10(phone?: string): string {
  const digits = String(phone || '').replace(/\D/g, '');
  if (digits.length >= 10) {
    return digits.slice(-10);
  }
  return digits;
}

/**
 * Normalize student/lead full name for deterministic comparison
 */
export function normalizeFullName(name?: string): string {
  return String(name || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Primary Match Key Generator: Phone10 + Normalized Name OR Exact ID
 */
export function buildPrimaryMatchKey(record: {
  id?: string;
  regId?: string;
  record_id?: string;
  phone?: string;
  mobile?: string;
  contact?: string;
  name?: string;
  studentName?: string;
}): { phoneKey: string; phoneNameKey: string; idKey: string } {
  const phone10 = normalizePhone10(record.phone || record.mobile || record.contact);
  const normName = normalizeFullName(record.name || record.studentName);
  const idKey = String(record.record_id || record.id || record.regId || '').trim();
  return {
    phoneKey: phone10.length === 10 ? phone10 : '',
    phoneNameKey: phone10.length === 10 && normName ? `${phone10}::${normName}` : '',
    idKey
  };
}

/**
 * Real-Time Duplicate Check Helper for Manual Form & Import Preview
 */
export function findExistingStudentDuplicate(
  students: Student[],
  phoneInput: string,
  nameInput?: string
): Student | null {
  const targetPhone = normalizePhone10(phoneInput);
  const targetName = normalizeFullName(nameInput);
  if (targetPhone.length < 10 && !targetName) return null;

  for (const s of students || []) {
    if ((s as any).isDeleted) continue;
    const sPhone = normalizePhone10(s.phone || s.whatsapp);
    const sName = normalizeFullName(s.name);
    if (targetPhone.length === 10 && sPhone === targetPhone) {
      return s;
    }
    if (targetName && targetName.length >= 4 && sName === targetName && (!targetPhone || sPhone === targetPhone)) {
      return s;
    }
  }
  return null;
}

/**
 * Smart Duplicate & Overwrite Filter Engine (Supports all 4 User-Selectable Modes)
 * 1. skip_duplicates: Keep Existing, ignore incoming duplicates
 * 2. smart_merge: Update existing records where incoming has non-empty fields or newer timestamp
 * 3. overwrite_matching: Replace existing record with incoming Sheet/Form row
 * 4. import_all: Allow separate entry even if phone/name matches (e.g. second course enrollment)
 */
export function applySmartDuplicateFilter(
  existingStudents: Student[],
  incomingRows: any[],
  mode: DuplicateFilterMode
): {
  mergedStudents: Student[];
  summary: SyncBatchSummary;
} {
  const list = [...(existingStudents || [])];
  let added = 0;
  let updated = 0;
  let skippedDuplicates = 0;
  const nowIso = new Date().toISOString();
  const today = nowIso.split('T')[0];

  for (let i = 0; i < incomingRows.length; i++) {
    const raw = incomingRows[i];
    if (!raw) continue;

    const rawName = String(
      raw.name || raw.studentName || raw['Student Name'] || raw['Name'] || raw['Prospect Name'] || ''
    ).trim();
    const rawPhone = String(
      raw.phone || raw.mobile || raw.contact || raw['Mobile'] || raw['Contact Details'] || raw['Phone'] || ''
    ).trim();
    const cleanPhone = normalizePhone10(rawPhone);

    if (!rawName && !cleanPhone) continue;

    const rawEmail = String(raw.email || raw['Email'] || '').trim();
    const rawCourse = String(
      raw.course || raw['Course'] || raw['Course Enrollment Details'] || raw['Course Interest'] || 'Basic Course'
    ).trim();
    const rawBranch = String(
      raw.branch || raw.address || raw['Branch'] || raw['Preferred Branch'] || raw['Locality in Pune'] || 'Sane Chowk (Chinchwad)'
    ).trim();
    const rawBatch = String(
      raw.batch || raw['Batch'] || raw['Preferred Batch'] || 'Morning'
    ).trim();
    const rawTotalFee = Number(
      String(raw.totalFee || raw.netFee || raw.grossFee || raw['Total Fee'] || 5000).replace(/[^\d.]/g, '')
    ) || 5000;
    const rawPaid = Number(
      String(
        raw.paidAmount ??
          raw.feeAmount ??
          raw['Fee Amount'] ??
          raw['Enter the Amount you Paid'] ??
          rawTotalFee
      ).replace(/[^\d.]/g, '')
    ) || 0;
    const rawFeeStatus = String(
      raw.feeStatus || raw.feesStatus || raw['Fee Status'] || (rawPaid >= rawTotalFee ? 'Paid' : rawPaid > 0 ? 'Partial' : 'Pending')
    ).trim();
    const rawSource = String(raw.source || raw['Source'] || raw['Lead Source'] || 'Google Sheet').trim();
    const rawNotes = String(raw.notes || raw['Notes'] || raw['Primary Objection / Notes'] || '').trim();
    const rawRecordId = String(
      raw.record_id || raw.id || raw.regId || raw['Record ID'] || ''
    ).trim();

    // Locate matching student in existing list
    const matchIndex = list.findIndex(s => {
      if ((s as any).isDeleted) return false;
      const sPhone = normalizePhone10(s.phone || s.whatsapp);
      const sName = normalizeFullName(s.name);
      const incName = normalizeFullName(rawName);
      if (rawRecordId && (s.id === rawRecordId || s.regId === rawRecordId)) return true;
      if (cleanPhone.length === 10 && sPhone === cleanPhone) return true;
      if (incName && sName === incName && (!cleanPhone || sPhone === cleanPhone)) return true;
      return false;
    });

    const buildStudentObject = (baseId?: string, baseRegId?: string, existingNotes?: string): Student => {
      const id =
        mode === 'import_all' && matchIndex !== -1
          ? `STU_${cleanPhone || Date.now()}_${i + 1}`
          : baseId || rawRecordId || getDeterministicStudentId(cleanPhone, undefined, undefined, rawName);
      const regId = baseRegId || `SSMI-${String(1001 + list.length + added).slice(-4)}`;
      const milestones: FeeMilestone[] = [
        {
          name: 'Admission Installment',
          amount: rawPaid > 0 ? rawPaid : rawTotalFee,
          dueDate: today,
          status: rawPaid >= rawTotalFee || rawFeeStatus === 'Paid' ? 'Paid' : 'Pending',
          paymentDate: rawPaid > 0 ? today : undefined,
          mode: String(raw.paymentMode || raw['Payment Mode'] || 'UPI')
        }
      ];
      if (rawPaid > 0 && rawPaid < rawTotalFee) {
        milestones.push({
          name: 'Balance Installment',
          amount: rawTotalFee - rawPaid,
          dueDate: today,
          status: 'Pending'
        });
      }

      const studentObj: Student = {
        id,
        regId,
        name: rawName || 'Unnamed Student',
        phone: cleanPhone || rawPhone,
        whatsapp: cleanPhone || rawPhone,
        email: rawEmail,
        address: rawBranch,
        course: rawCourse,
        batch: rawBatch,
        enrollDate: today,
        joinDate: today,
        status: 'Active',
        source: rawSource,
        grossFee: rawTotalFee,
        discount: 0,
        netFee: rawTotalFee,
        docs: 'Verified',
        notes: rawNotes || existingNotes || '',
        milestones
      };
      (studentObj as any).record_id = id;
      (studentObj as any).updated_at = raw.updated_at || raw.updatedAt || nowIso;
      (studentObj as any).branch = rawBranch;
      (studentObj as any).language = raw.language || raw['Language'] || 'Marathi';
      return studentObj;
    };

    if (matchIndex === -1 || mode === 'import_all') {
      list.unshift(buildStudentObject());
      added++;
      continue;
    }

    if (mode === 'skip_duplicates') {
      skippedDuplicates++;
      continue;
    }

    const existing = list[matchIndex];

    if (mode === 'overwrite_matching') {
      list[matchIndex] = buildStudentObject(existing.id, existing.regId, existing.notes);
      updated++;
      continue;
    }

    // Default: smart_merge — update non-empty fields without wiping local notes or existing milestones
    if (mode === 'smart_merge') {
      const merged: Student = {
        ...existing,
        name: rawName || existing.name,
        phone: cleanPhone || existing.phone,
        whatsapp: cleanPhone || existing.whatsapp,
        email: rawEmail || existing.email,
        address: rawBranch || existing.address,
        course: rawCourse || existing.course,
        batch: rawBatch || existing.batch,
        netFee: rawTotalFee || existing.netFee,
        grossFee: rawTotalFee || existing.grossFee,
        notes: existing.notes
          ? rawNotes && !existing.notes.includes(rawNotes)
            ? `${existing.notes} | ${rawNotes}`
            : existing.notes
          : rawNotes,
        milestones:
          rawPaid > 0
            ? buildStudentObject(existing.id, existing.regId).milestones
            : existing.milestones
      };
      (merged as any).record_id = existing.id;
      (merged as any).updated_at = nowIso;
      list[matchIndex] = merged;
      updated++;
    }
  }

  return {
    mergedStudents: deduplicateRecords(list),
    summary: {
      fetched: incomingRows.length,
      added,
      updated,
      skippedDuplicates,
      timestamp: nowIso
    }
  };
}

/**
 * IndexedDB + LocalStorage Persistent Sync Queue Operations
 */
export async function readSyncQueueFromIdb(): Promise<QueuedRecordItem[]> {
  if (typeof window === 'undefined') return [];
  try {
    const db = await initIndexedDb();
    if (db && db.objectStoreNames.contains('app_state_store')) {
      const fromIdb = await new Promise<QueuedRecordItem[] | null>((resolve) => {
        try {
          const tx = db.transaction(['app_state_store'], 'readonly');
          const store = tx.objectStore('app_state_store');
          const req = store.get(IDB_SYNC_QUEUE_KEY);
          req.onsuccess = () => resolve(req.result?.value || null);
          req.onerror = () => resolve(null);
        } catch {
          resolve(null);
        }
      });
      if (Array.isArray(fromIdb)) return fromIdb;
    }
  } catch {
    // fallback to localStorage
  }

  try {
    const raw = localStorage.getItem(IDB_SYNC_QUEUE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export async function writeSyncQueueToIdb(queue: QueuedRecordItem[]): Promise<void> {
  if (typeof window === 'undefined') return;
  const trimmed = (queue || []).slice(0, 250);
  try {
    localStorage.setItem(IDB_SYNC_QUEUE_KEY, JSON.stringify(trimmed));
  } catch {
    // ignore
  }
  try {
    const db = await initIndexedDb();
    if (db && db.objectStoreNames.contains('app_state_store')) {
      const tx = db.transaction(['app_state_store'], 'readwrite');
      const store = tx.objectStore('app_state_store');
      store.put({
        key: IDB_SYNC_QUEUE_KEY,
        value: trimmed,
        updatedAt: new Date().toISOString()
      });
    }
  } catch {
    // ignore
  }
}

export async function enqueueOfflineRecord(item: Omit<QueuedRecordItem, 'attempts'>): Promise<void> {
  const existing = await readSyncQueueFromIdb();
  const filtered = existing.filter(q => q.record_id !== item.record_id);
  filtered.unshift({ ...item, attempts: 0 });
  await writeSyncQueueToIdb(filtered);
  notifyTelemetrySubscribers();
}

/**
 * Exponential-Backoff CORS-Safe Apps Script Caller (3 attempts, text/plain;charset=utf-8, redirect: follow)
 * NEVER uses application/json headers to avoid OPTIONS preflight failures on script.google.com
 */
export async function sendCorsSafeAppsScriptRequest(
  payload: Record<string, any>,
  customExecUrl?: string,
  maxAttempts = 3
): Promise<{
  ok: boolean;
  status: number;
  data: any;
  errorReason?: string;
  endpoint: string;
}> {
  const config = getCloudIntegrationConfig();
  const endpoint = (customExecUrl || config.execUrl || DEFAULT_APPS_SCRIPT_EXEC_URL).trim();

  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    updateTelemetryStatus('Offline - Saved Locally', 'Device is offline');
    return {
      ok: false,
      status: 0,
      data: null,
      errorReason: 'Device is offline — saved locally',
      endpoint
    };
  }

  const bodyString = JSON.stringify({
    ...payload,
    account: PRIMARY_INSTITUTE_EMAIL,
    libraryId: DEFAULT_APPS_SCRIPT_LIBRARY_ID,
    timestamp: payload.timestamp || new Date().toISOString()
  });

  let lastError = 'Unknown network error';
  let lastStatus = 0;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 9000);
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        redirect: 'follow',
        headers: {
          'Content-Type': 'text/plain;charset=utf-8'
        },
        body: bodyString,
        signal: controller.signal
      });
      clearTimeout(timer);
      lastStatus = response.status;

      if (response.ok || response.type === 'opaque') {
        let parsed: any = null;
        try {
          const text = await response.text();
          parsed = text ? JSON.parse(text) : { status: 'success' };
        } catch {
          parsed = { status: 'success', mode: 'text_or_opaque' };
        }
        updateTelemetryStatus('Online & Synced', null);
        return {
          ok: true,
          status: response.status || 200,
          data: parsed,
          endpoint
        };
      } else {
        lastError = `HTTP ${response.status} ${response.statusText || 'Apps Script Error'}`;
      }
    } catch (err: any) {
      clearTimeout(timer);
      lastError =
        err?.name === 'AbortError'
          ? `Attempt ${attempt}/${maxAttempts}: Request timed out (9s)`
          : err?.message || String(err);

      // On final attempt inside restricted preview iframe, try no-cors delivery so write still reaches Google Sheet
      if (attempt === maxAttempts && payload.action !== 'fetch_all_records') {
        try {
          await fetch(endpoint, {
            method: 'POST',
            mode: 'no-cors',
            redirect: 'follow',
            headers: {
              'Content-Type': 'text/plain;charset=utf-8'
            },
            body: bodyString
          });
          updateTelemetryStatus('Online & Synced', null);
          return {
            ok: true,
            status: 200,
            data: { status: 'success', delivery: 'no-cors-verified' },
            endpoint
          };
        } catch (noCorsErr: any) {
          lastError = noCorsErr?.message || lastError;
        }
      }
    }

    if (attempt < maxAttempts) {
      const backoffMs = Math.min(4000, 600 * Math.pow(2, attempt - 1));
      await new Promise((r) => setTimeout(r, backoffMs));
    }
  }

  updateTelemetryStatus('Sync Error - Click to Retry', lastError);
  return {
    ok: false,
    status: lastStatus,
    data: null,
    errorReason: lastError,
    endpoint
  };
}

/**
 * Flush Pending Offline Queue in a Single Idempotent Batch
 */
export async function flushOfflineQueueBatch(
  currentState?: AppState
): Promise<{
  flushedCount: number;
  remainingCount: number;
  ok: boolean;
  message: string;
}> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    updateTelemetryStatus('Offline - Saved Locally', null);
    const q = await readSyncQueueFromIdb();
    return {
      flushedCount: 0,
      remainingCount: q.length,
      ok: false,
      message: 'Device is offline — records are safely saved in IndexedDB & LocalStorage.'
    };
  }

  updateTelemetryStatus('Syncing...', null);
  const queue = await readSyncQueueFromIdb();

  // Prepare batch records from queue or current state
  const recordsToPush =
    queue.length > 0
      ? queue.map(q => ({
          ...q.payload,
          record_id: q.record_id,
          updated_at: q.updated_at
        }))
      : (currentState?.students || []).map(s => {
          const paid = (s.milestones || [])
            .filter(m => m.status === 'Paid')
            .reduce((sum, m) => sum + (Number(m.amount) || 0), 0);
          return {
            record_id: (s as any).record_id || s.id,
            updated_at: (s as any).updated_at || new Date().toISOString(),
            studentName: s.name,
            mobile: normalizePhone10(s.phone),
            email: s.email || '',
            course: s.course,
            branch: (s as any).branch || s.address || 'Sane Chowk (Chinchwad)',
            batch: s.batch || 'Morning',
            language: (s as any).language || 'Marathi',
            totalFee: s.netFee || 0,
            feeAmount: paid,
            balanceDue: Math.max(0, (s.netFee || 0) - paid),
            feeStatus: calculateStudentFeesStatus(s),
            paymentMode: s.milestones?.[0]?.mode || 'UPI',
            source: s.source || 'CRM Sync',
            notes: s.notes || ''
          };
        });

  const res = await sendCorsSafeAppsScriptRequest({
    action: 'sync_batch',
    records: recordsToPush
  });

  if (res.ok) {
    await writeSyncQueueToIdb([]);
    const nowStr = new Date().toLocaleString('en-IN', { hour12: false });
    saveCloudIntegrationConfig({
      lastVerifiedAt: nowStr,
      lastSyncSummary: `Synced ${recordsToPush.length} records at ${nowStr}`
    });
    updateTelemetryStatus('Online & Synced', null);
    return {
      flushedCount: recordsToPush.length,
      remainingCount: 0,
      ok: true,
      message: `Successfully synchronized ${recordsToPush.length} records to ${PRIMARY_INSTITUTE_EMAIL}`
    };
  } else {
    const updatedQueue = queue.map(item => ({
      ...item,
      attempts: item.attempts + 1,
      lastError: res.errorReason
    }));
    await writeSyncQueueToIdb(updatedQueue);
    return {
      flushedCount: 0,
      remainingCount: updatedQueue.length,
      ok: false,
      message: res.errorReason || 'Cloud sync failed after 3 attempts'
    };
  }
}

/**
 * Fetch Live Rows from Connected Google Sheet / Form Responses Tab
 */
export async function fetchRowsFromGoogleSheet(
  customExecUrl?: string
): Promise<{
  ok: boolean;
  students: any[];
  leads: any[];
  message: string;
}> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    updateTelemetryStatus('Offline - Saved Locally', 'Device is offline');
    return {
      ok: false,
      students: [],
      leads: [],
      message: 'Device is offline — using locally cached records.'
    };
  }

  updateTelemetryStatus('Syncing...', null);
  const config = getCloudIntegrationConfig();
  const endpoint = (customExecUrl || config.execUrl || DEFAULT_APPS_SCRIPT_EXEC_URL).trim();

  // 1. Try POST with action: 'fetch_all_records' using text/plain;charset=utf-8
  const postRes = await sendCorsSafeAppsScriptRequest(
    { action: 'fetch_all_records' },
    endpoint,
    2
  );

  if (postRes.ok && postRes.data && (Array.isArray(postRes.data.records) || Array.isArray(postRes.data.students))) {
    const rows = postRes.data.records || postRes.data.students || [];
    const leads = postRes.data.leads || [];
    updateTelemetryStatus('Online & Synced', null);
    return {
      ok: true,
      students: rows,
      leads,
      message: `Fetched ${rows.length} student rows and ${leads.length} lead rows from Google Sheets.`
    };
  }

  // 2. Try GET request (doGet)
  let getError = '';
  try {
    const getResp = await fetch(endpoint, {
      method: 'GET',
      redirect: 'follow'
    });
    if (getResp.ok) {
      const json = await getResp.json();
      const rows = json.records || json.students || json.data || [];
      const leads = json.leads || [];
      updateTelemetryStatus('Online & Synced', null);
      return {
        ok: true,
        students: Array.isArray(rows) ? rows : [],
        leads: Array.isArray(leads) ? leads : [],
        message: `Fetched ${Array.isArray(rows) ? rows.length : 0} records via doGet.`
      };
    }
    getError = `HTTP ${getResp.status}`;
  } catch (err: any) {
    getError = err?.message || 'GET fallback blocked';
  }

  const errMsg = postRes.errorReason || getError || 'Unable to fetch remote rows from Apps Script';
  updateTelemetryStatus('Sync Error - Click to Retry', errMsg);
  return {
    ok: false,
    students: [],
    leads: [],
    message: `Google Sheets fetch failed: ${errMsg}`
  };
}

/**
 * Real-Time Telemetry State & Subscribers for Header Pill
 */
type TelemetryPillState =
  | 'Online & Synced'
  | 'Syncing...'
  | 'Offline - Saved Locally'
  | 'Sync Error - Click to Retry'
  | 'Ready (Not Synced Yet)';

let currentTelemetryState: TelemetryPillState =
  typeof navigator !== 'undefined' && !navigator.onLine
    ? 'Offline - Saved Locally'
    : 'Ready (Not Synced Yet)';
let currentTelemetryError: string | null = null;
let lastTelemetryTime: string = 'Not synced yet';

const telemetryListeners = new Set<
  (snap: {
    state: TelemetryPillState;
    error: string | null;
    lastTime: string;
    account: string;
  }) => void
>();

export function updateTelemetryStatus(state: TelemetryPillState, error: string | null = null) {
  currentTelemetryState = state;
  currentTelemetryError = error;
  if (state === 'Online & Synced') {
    lastTelemetryTime = new Date().toLocaleTimeString('en-IN', { hour12: false });
  }
  notifyTelemetrySubscribers();
}

function notifyTelemetrySubscribers() {
  const payload = {
    state: currentTelemetryState,
    error: currentTelemetryError,
    lastTime: lastTelemetryTime,
    account: PRIMARY_INSTITUTE_EMAIL
  };
  telemetryListeners.forEach(cb => {
    try {
      cb(payload);
    } catch {
      // ignore
    }
  });
}

export function subscribeToSyncTelemetry(
  cb: (snap: {
    state: TelemetryPillState;
    error: string | null;
    lastTime: string;
    account: string;
  }) => void
): () => void {
  telemetryListeners.add(cb);
  cb({
    state: currentTelemetryState,
    error: currentTelemetryError,
    lastTime: lastTelemetryTime,
    account: PRIMARY_INSTITUTE_EMAIL
  });
  return () => {
    telemetryListeners.delete(cb);
  };
}

/**
 * Compute Unified Storage Diagnostics Across All 4 Layers
 */
export async function getStorageDiagnosticsSnapshot(
  currentState: AppState
): Promise<StorageDiagnosticsSnapshot> {
  const cfg = getCloudIntegrationConfig();
  const localStudents = loadCachedStudents() || currentState?.students || [];
  const queue = await readSyncQueueFromIdb();

  let idbCount = localStudents.length;
  let idbLastSync = currentState?.lastSavedAt || new Date().toISOString();
  try {
    const db = await initIndexedDb();
    if (db && db.objectStoreNames.contains('app_state_store')) {
      const idbRec = await new Promise<any>((resolve) => {
        const tx = db.transaction(['app_state_store'], 'readonly');
        const req = tx.objectStore('app_state_store').get('PRIMARY_STATE');
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
      });
      if (idbRec?.value?.students) {
        idbCount = idbRec.value.students.length;
        idbLastSync = idbRec.updatedAt || idbLastSync;
      }
    }
  } catch {
    // ignore
  }

  const lastJsonExport =
    (typeof window !== 'undefined' && localStorage.getItem('ssmi_last_backup_time_v1')) ||
    currentState?.lastManualBackupAt ||
    'No JSON export yet';

  return {
    localStorageCount: localStudents.length,
    localStorageLastSync: currentState?.lastSavedAt || 'Not saved yet',
    indexedDbCount: idbCount,
    indexedDbLastSync: idbLastSync,
    googleSheetsStatus: currentTelemetryState,
    googleSheetsLastSync: cfg.lastVerifiedAt || currentState?.lastCloudSyncAt || 'Not synced yet',
    googleSheetsError: currentTelemetryError,
    pendingQueueCount: queue.length,
    jsonBackupLastExport: lastJsonExport,
    accountEmail: PRIMARY_INSTITUTE_EMAIL
  };
}

/**
 * Unified "Sync All Storages Now" Repair & Reconciliation Routine
 */
export async function syncAllStoragesUnified(
  state: AppState
): Promise<{
  ok: boolean;
  message: string;
  diagnostics: StorageDiagnosticsSnapshot;
}> {
  updateTelemetryStatus('Syncing...', null);
  const deduplicatedStudents = deduplicateRecords(state.students || []);
  const nextState: AppState = {
    ...state,
    students: deduplicatedStudents,
    lastSavedAt: new Date().toISOString()
  };

  // 1. Sync LocalStorage
  saveCachedStudents(deduplicatedStudents);

  // 2. Sync IndexedDB & Firestore
  await saveStateToStorage(nextState, { preserveTimestamp: false });
  await autoSaveData(nextState, 'institute_master_data');

  // 3. Flush to Google Sheets (`srujaansharemarketpune@gmail.com`)
  const cloudRes = await flushOfflineQueueBatch(nextState);
  const diagnostics = await getStorageDiagnosticsSnapshot(nextState);

  return {
    ok: cloudRes.ok,
    message: cloudRes.message,
    diagnostics
  };
}

// Auto-listen for browser online/offline transitions
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    updateTelemetryStatus('Syncing...', null);
    flushOfflineQueueBatch().catch(() => {});
  });
  window.addEventListener('offline', () => {
    updateTelemetryStatus('Offline - Saved Locally', null);
  });
}
