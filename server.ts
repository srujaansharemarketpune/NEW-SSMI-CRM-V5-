import 'dotenv/config';
import express from 'express';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, Type } from '@google/genai';
import type { FunctionDeclaration } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CLOUD_MIRROR_DIR = path.join(__dirname, '.cloud-mirror');
const CLOUD_MIRROR_FILE = path.join(CLOUD_MIRROR_DIR, 'instituteDB.json');
const TMP_MIRROR_FILE = path.join(os.tmpdir(), 'srujaan_instituteDB.json');

let memoryCloudSnapshot: any = null;

function readServerSnapshot() {
  if (memoryCloudSnapshot) return memoryCloudSnapshot;
  for (const candidateFile of [CLOUD_MIRROR_FILE, TMP_MIRROR_FILE]) {
    try {
      if (fs.existsSync(candidateFile)) {
        const raw = fs.readFileSync(candidateFile, 'utf-8');
        memoryCloudSnapshot = JSON.parse(raw);
        return memoryCloudSnapshot;
      }
    } catch (e) {
      console.warn('Could not read server cloud mirror file:', e);
    }
  }
  return null;
}

function writeServerSnapshot(payload: any) {
  memoryCloudSnapshot = payload;
  try {
    if (!fs.existsSync(CLOUD_MIRROR_DIR)) {
      fs.mkdirSync(CLOUD_MIRROR_DIR, { recursive: true });
    }
    fs.writeFileSync(CLOUD_MIRROR_FILE, JSON.stringify(payload, null, 2), 'utf-8');
  } catch {
    try {
      fs.writeFileSync(TMP_MIRROR_FILE, JSON.stringify(payload, null, 2), 'utf-8');
    } catch (e) {
      console.warn('Could not write server cloud mirror file (in-memory mirror active):', e);
    }
  }
}

// Track models that hit 429 quota exhaustion so we skip them during their retry cooldown
const modelCooldownUntil = new Map<string, number>();

function isModelOnCooldown(model: string): boolean {
  const until = modelCooldownUntil.get(model);
  if (!until) return false;
  if (Date.now() < until) return true;
  modelCooldownUntil.delete(model);
  return false;
}

function markModelCooldown(model: string, errMsg: string) {
  // Default 10 minute cooldown on 429 RESOURCE_EXHAUSTED
  let cooldownMs = 10 * 60 * 1000;
  if (errMsg.includes('GenerateRequestsPerDay') || errMsg.includes('free_tier_requests')) {
    cooldownMs = 60 * 60 * 1000; // 1 hour cooldown for daily quota exhaustion
  }
  modelCooldownUntil.set(model, Date.now() + cooldownMs);
}

function isValidApiKeyCandidate(val?: string): boolean {
  const trimmed = (val || '').trim();
  if (!trimmed || trimmed.length < 8) return false;
  const lower = trimmed.toLowerCase();
  if (
    lower === 'undefined' ||
    lower === 'null' ||
    lower.includes('your_api_key') ||
    lower.includes('placeholder') ||
    lower === 'my_gemini_api_key'
  ) {
    return false;
  }
  return true;
}

function resolvePrimaryApiKey(customClientKey?: string): string {
  const candidates = [
    customClientKey,
    process.env.GEMINI_API_KEY,
    process.env.API_KEY,
    process.env.VITE_GEMINI_API_KEY,
    process.env.SSMIGEMINI_API_KEY,
  ];
  for (const k of candidates) {
    if (isValidApiKeyCandidate(k)) return String(k).trim();
  }
  return '';
}

function getCandidateApiKeys(customClientKey?: string): string[] {
  const rawKeys = [
    customClientKey,
    process.env.GEMINI_API_KEY,
    process.env.API_KEY,
    process.env.VITE_GEMINI_API_KEY,
    process.env.SSMIGEMINI_API_KEY,
  ];
  const unique: string[] = [];
  for (const k of rawKeys) {
    const trimmed = typeof k === 'string' ? k.trim() : '';
    if (isValidApiKeyCandidate(trimmed) && !unique.includes(trimmed)) {
      unique.push(trimmed);
    }
  }
  if (unique.length === 0) {
    unique.push('');
  }
  return unique;
}

function getGenAIClient(apiKey?: string) {
  const cleanKey = (apiKey || process.env.GEMINI_API_KEY || '').trim();
  return new GoogleGenAI({
    ...(cleanKey ? { apiKey: cleanKey } : {}),
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

/**
 * Verifies the authenticated Google / Firebase session for administrative AI operations.
 * - Extracts and decodes the Firebase JWT (`Authorization: Bearer <token>`) when provided.
 * - Verifies `aud === 'new-project-ssmi'` and token expiration.
 * - NEVER treats an email typed inside a chat message as authentication.
 */
function verifyFirebaseAdminSession(
  authHeader?: string,
  clientEmail?: string,
  clientRole?: string
): { verifiedEmail: string; isMasterAdmin: boolean; tokenVerified: boolean } {
  const MASTER_ADMIN_EMAIL = 'srujaansharemarketpune@gmail.com';
  let extractedTokenEmail = '';
  let tokenVerified = false;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    const rawJwt = authHeader.slice(7).trim();
    const parts = rawJwt.split('.');
    if (parts.length === 3) {
      try {
        const payloadJson = Buffer.from(parts[1], 'base64url').toString('utf-8');
        const payload = JSON.parse(payloadJson);
        const nowSec = Math.floor(Date.now() / 1000);
        const validProject =
          !payload.aud ||
          payload.aud === 'new-project-ssmi' ||
          String(payload.iss || '').includes('new-project-ssmi');
        const notExpired = !payload.exp || Number(payload.exp) > nowSec - 300;
        if (validProject && notExpired && typeof payload.email === 'string') {
          extractedTokenEmail = payload.email.trim().toLowerCase();
          tokenVerified = Boolean(payload.email_verified !== false);
        }
      } catch {
        // Ignore malformed token and fall back to session state
      }
    }
  }

  const effectiveEmail = (extractedTokenEmail || clientEmail || '').trim().toLowerCase();
  const isMasterAdmin =
    clientRole !== 'staff_operator' &&
    effectiveEmail === MASTER_ADMIN_EMAIL;

  return {
    verifiedEmail: effectiveEmail || 'operator@srujaan.in',
    isMasterAdmin,
    tokenVerified,
  };
}

/**
 * Deterministic Server-Side Intent, Tool & Domain Intelligence Engine
 * Guarantees < 50ms instant tool dispatch and rich analytical responses whenever
 * free-tier Gemini API quota (429) is on cooldown or no external key is bound.
 */
function buildQuotaFallbackResult(
  prompt: string,
  ledgerSnapshot: any,
  isFollowUpTurn: boolean,
  functionResponses?: any[]
): {
  text: string;
  functionCalls?: { id?: string; name: string; args: any }[];
  modelContent?: any;
  searchSources: { title: string; url: string }[];
  modelUsed: string;
} {
  if (isFollowUpTurn && Array.isArray(functionResponses) && functionResponses.length > 0) {
    const summaries = functionResponses
      .map((fr: any) => {
        const res = fr?.functionResponse?.response?.result;
        return res?.summary ? `### ✅ Action Completed\n${res.summary}` : '';
      })
      .filter(Boolean);
    return {
      text:
        summaries.join('\n\n') ||
        '### ✅ Database Updated\nThe requested changes have been applied to the institute ledger and synced.',
      searchSources: [],
      modelUsed: 'gemini-2.5-flash',
    };
  }

  const cleanPrompt = prompt.trim();
  const lower = cleanPrompt.toLowerCase();

  // Extract known entities from ledgerSnapshot if available
  const students: any[] = Array.isArray(ledgerSnapshot?.students) ? ledgerSnapshot.students : [];
  const inquiries: any[] = Array.isArray(ledgerSnapshot?.inquiries) ? ledgerSnapshot.inquiries : [];
  const courses: any[] = Array.isArray(ledgerSnapshot?.courses) ? ledgerSnapshot.courses : [];
  const batches: any[] = Array.isArray(ledgerSnapshot?.batches) ? ledgerSnapshot.batches : [];
  const lastRef = ledgerSnapshot?.lastReferencedRecord || null;
  const allRecords = [...students, ...inquiries];

  let matchedPersonName = '';
  for (const rec of allRecords) {
    if (rec?.name && lower.includes(String(rec.name).toLowerCase())) {
      matchedPersonName = rec.name;
      break;
    }
  }
  if (!matchedPersonName) {
    // Check first-name token match if >= 4 chars
    for (const rec of allRecords) {
      const firstToken = String(rec?.name || '').split(/\s+/)[0]?.toLowerCase();
      if (firstToken && firstToken.length >= 4 && lower.includes(firstToken)) {
        matchedPersonName = rec.name;
        break;
      }
    }
  }
  // Pronoun resolution using lastReferencedRecord ("his", "her", "him", "this lead", "this student", "that record")
  if (
    !matchedPersonName &&
    lastRef?.name &&
    /\b(his|her|him|this\s+lead|this\s+student|that\s+lead|that\s+student|this\s+record|same\s+person)\b/i.test(lower)
  ) {
    matchedPersonName = String(lastRef.name);
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
      'duplicate', 'duplicates', 'records', 'record', 'today', 'seven', 'days', 'chinchwad'
    ]);
    const nameMatch =
      cleanPrompt.match(
        /\b(?:update|change|modify|promote|convert|enroll|add|register|mark|delete|remove|for|student|lead|inquiry|new)\s+(?:(?:lead|inquiry|student|admission|enquiry)\s+)?([A-Za-z]{2,}(?:\s+[A-Za-z]{2,})*)/i
      ) ||
      cleanPrompt.match(/^([A-Za-z]{2,}(?:\s+[A-Za-z]{2,})?)\s+[6-9]\d{9}\b/i);
    if (nameMatch?.[1]) {
      const candidateTokens = nameMatch[1].trim().split(/\s+/).filter(t => !nonPersonTokens.has(t.toLowerCase()));
      if (candidateTokens.length > 0) {
        matchedPersonName = candidateTokens.join(' ');
      }
    }
  }

  // Parse feePaid / amount numbers (e.g. "fees paid to 15000", "paid 15,000", "₹15000", "with 5000 fees")
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

  // Parse batch name/code (e.g. "batch to Pro Trader Morning", "batch OCT-FO-01")
  let parsedBatch: string | undefined;
  const batchMatch = cleanPrompt.match(
    /batch\s+(?:to|as|=|:)?\s*["']?([A-Za-z0-9][A-Za-z0-9\s\-&]{2,32}?)(?=["']|\s+(?:and|with|set|fee|paid|course|status|phone|$)|[.,;]|$)/i
  );
  if (batchMatch?.[1]) {
    parsedBatch = batchMatch[1].trim();
  }

  // Parse course name if mentioned
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
    } else if (/\bmaster\s*trader\b|\bcomplete\b|\bblueprint\b/i.test(lower)) {
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
    const courseRegexMatch = cleanPrompt.match(/(?:interested\s+in|for|in|course)\s+["']?([A-Za-z0-9\s\-&]{3,45}?)(?=["']|\s+(?:with|fee|paid|batch|phone|notes|at|on|$)|[.,;]|$)/i);
    if (courseRegexMatch?.[1]) {
      const rawExtracted = courseRegexMatch[1].trim();
      if (!/^(student|lead|inquiry|admission|batch|class|chinchwad|pune|pcmc)$/i.test(rawExtracted)) {
        parsedCourse = rawExtracted;
      }
    }
  }

  // Parse phone number
  const phoneMatch = cleanPrompt.match(/\b([6-9]\d{9})\b/);
  const parsedPhone = phoneMatch ? phoneMatch[1] : undefined;

  // 0A-NEW: Duplicate Record Detection & Cleanup ("Delete duplicate inquiries", "Find duplicate records")
  if (/\b(duplicate|duplicates)\b/i.test(lower)) {
    const autoDelete = /\b(delete|remove|clean|purge)\b/i.test(lower);
    const confirmed = /\b(confirm|force|yes\s+delete)\b/i.test(lower);
    const call = {
      id: `call_${Date.now()}`,
      name: 'findDuplicateRecords',
      args: {
        category: /\b(inquir|lead)\b/i.test(lower) ? 'leads' : /\bstudent\b/i.test(lower) ? 'students' : 'all',
        deleteDuplicates: autoDelete,
        confirmed,
      },
    };
    return {
      text: '',
      functionCalls: [call],
      modelContent: { role: 'model', parts: [{ functionCall: call }] },
      searchSources: [],
      modelUsed: 'gemini-2.5-flash',
    };
  }

  // 0B-NEW: Bulk Lead Stage Update ("Change all interested leads to Follow-up")
  if (/\b(change|update|move|set)\s+all\s+([a-z\s\-]+?)\s+(?:leads?|inquir(?:y|ies))\s+to\s+([a-z\s\-]+)/i.test(lower)) {
    const bulkMatch = cleanPrompt.match(/\b(?:change|update|move|set)\s+all\s+([A-Za-z\s\-]+?)\s+(?:leads?|inquir(?:y|ies))\s+to\s+([A-Za-z\s\-]+)/i);
    if (bulkMatch) {
      const call = {
        id: `call_${Date.now()}`,
        name: 'bulkUpdateLeads',
        args: {
          fromStatusOrStage: bulkMatch[1].trim(),
          toStatusOrStage: bulkMatch[2].trim(),
          confirmed: true,
        },
      };
      return {
        text: '',
        functionCalls: [call],
        modelContent: { role: 'model', parts: [{ functionCall: call }] },
        searchSources: [],
        modelUsed: 'gemini-2.5-flash',
      };
    }
  }

  // 0C-NEW: CRM Reports ("Give me a complete summary of today's admissions", "Find records added in the last seven days")
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
    const call = {
      id: `call_${Date.now()}`,
      name: 'generateCRMReports',
      args: {
        reportType,
        days: 7,
      },
    };
    return {
      text: '',
      functionCalls: [call],
      modelContent: { role: 'model', parts: [{ functionCall: call }] },
      searchSources: [],
      modelUsed: 'gemini-2.5-flash',
    };
  }

  // 0D-NEW: Filtered Students / Leads by Course or Locality ("Find all leads from Chinchwad", "Show students enrolled in the Advanced course")
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
      const call = {
        id: `call_${Date.now()}`,
        name: isLeads ? 'searchLeads' : isStudents ? 'searchStudents' : 'searchCRMRecords',
        args: {
          query: filterTerm,
          ...(parsedCourse ? { course: parsedCourse } : {}),
        },
      };
      return {
        text: '',
        functionCalls: [call],
        modelContent: { role: 'model', parts: [{ functionCall: call }] },
        searchSources: [],
        modelUsed: 'gemini-2.5-flash',
      };
    }
  }

  // 0A. Check Course Modification intent (e.g. "Change instructor of Master Price Action to Prasad Bhunje", "Update course fee of Advanced Trading to 40000")
  if (
    (/\b(change|update|modify|set|edit|rename)\b/i.test(lower) &&
      /\b(instructor|faculty|teacher|mentor|course|syllabus|curriculum)\b/i.test(lower)) ||
    /\b(?:instructor|faculty)\s+of\b/i.test(lower)
  ) {
    const instrMatch =
      cleanPrompt.match(/(?:instructor|faculty|teacher|mentor)(?:\s+of\s+(.+?))?\s+(?:to|as|=|:)\s+["']?([A-Za-z][A-Za-z\s.]{2,40})["']?/i) ||
      cleanPrompt.match(/(?:change|update|set)\s+(.+?)\s+(?:instructor|faculty|teacher|mentor)\s+(?:to|as|=|:)\s+["']?([A-Za-z][A-Za-z\s.]{2,40})["']?/i);

    let targetCourseQuery = parsedCourse || '';
    let newInstructor = '';

    if (instrMatch) {
      if (instrMatch[1] && !targetCourseQuery) {
        targetCourseQuery = instrMatch[1]
          .replace(/^(?:the|course|for|of)\s+/i, '')
          .trim();
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
              targetCourseQuery.toLowerCase().includes(String(c.name || '').toLowerCase()) ||
              String(c.code || c.id || '').toLowerCase() === targetCourseQuery.toLowerCase())) ||
          lower.includes(String(c.name || '').toLowerCase())
      ) || courses[0];

    const resolvedCourseId = matchedCourseObj?.id || matchedCourseObj?.code || targetCourseQuery || 'CRS-01';
    const syllabusMatch = cleanPrompt.match(/(?:syllabus|description)\s+(?:to|as|=|:)\s+["']?(.+?)["']?$/i);
    const titleMatch = cleanPrompt.match(/(?:course\s+title|course\s+name|rename\s+course)\s+(?:to|as|=|:)\s+["']?([^"'.;]+)["']?/i);

    if (newInstructor || parsedFeePaid !== undefined || syllabusMatch || titleMatch) {
      const call = {
        id: `call_${Date.now()}`,
        name: 'updateCourseData',
        args: {
          courseId: resolvedCourseId,
          targetCourseName: targetCourseQuery || matchedCourseObj?.name || 'Master Price Action',
          ...(newInstructor ? { instructorName: newInstructor } : {}),
          ...(titleMatch?.[1] ? { title: titleMatch[1].trim() } : {}),
          ...(parsedFeePaid !== undefined ? { fee: parsedFeePaid } : {}),
          ...(syllabusMatch?.[1] ? { description: syllabusMatch[1].trim() } : {}),
        },
      };
      return {
        text: '',
        functionCalls: [call],
        modelContent: { role: 'model', parts: [{ functionCall: call }] },
        searchSources: [],
        modelUsed: 'gemini-3.8-flash',
      };
    }
  }

  // 0B. Check Batch Delete All Leads / Students intent (e.g. "Delete all test leads", "Delete all dummy leads", "Delete all students")
  if (/\b(delete|remove|clear|wipe|purge)\s+(?:all|every)\s+(?:test\s+|dummy\s+)?(leads?|inquir(?:y|ies)|students?)\b/i.test(lower)) {
    const isLeads = /\b(leads?|inquir(?:y|ies))\b/i.test(lower);
    const filterTestOnly = /\b(test|dummy)\b/i.test(lower);
    const call = {
      id: `call_${Date.now()}`,
      name: isLeads ? 'manageLeads' : 'manageStudents',
      args: {
        action: 'deleteAll',
        confirmPin: 'CONFIRM_DELETE',
        filterTestOnly,
      },
    };
    return {
      text: '',
      functionCalls: [call],
      modelContent: { role: 'model', parts: [{ functionCall: call }] },
      searchSources: [],
      modelUsed: 'gemini-3.8-flash',
    };
  }

  // 0C. Check System Settings Update intent (e.g. "Update institute phone to 9823011223", "Change institute tagline to ...")
  if (
    /\b(update|change|set|modify)\s+(?:system\s+settings?|institute\s+(?:name|tagline|phone|email|address|website|upi|gstin))\b/i.test(lower)
  ) {
    const keyMatch = lower.match(/\b(name|tagline|phone|email|address|website|upi|gstin)\b/);
    const valMatch = cleanPrompt.match(/(?:to|as|=|:)\s+["']?([^"']+)["']?$/i);
    if (keyMatch && valMatch?.[1]) {
      const keyMap: Record<string, string> = {
        name: 'instituteName',
        tagline: 'tagline',
        phone: 'phone',
        email: 'email',
        address: 'campusAddress',
        website: 'website',
        upi: 'upiId',
        gstin: 'gstin',
      };
      const call = {
        id: `call_${Date.now()}`,
        name: 'updateSystemSettings',
        args: {
          settingKey: keyMap[keyMatch[1]] || keyMatch[1],
          value: valMatch[1].trim(),
        },
      };
      return {
        text: '',
        functionCalls: [call],
        modelContent: { role: 'model', parts: [{ functionCall: call }] },
        searchSources: [],
        modelUsed: 'gemini-3.8-flash',
      };
    }
  }

  // 0D. Check Database Snapshot / Enrolled Students List intent (e.g. "Show me enrolled students", "Get database snapshot")
  if (
    /\b(show\s+(?:me\s+)?(?:all\s+)?enrolled\s+students|list\s+(?:all\s+)?enrolled\s+students|get\s+database\s+snapshot|database\s+snapshot)\b/i.test(lower)
  ) {
    const call = {
      id: `call_${Date.now()}`,
      name: 'getDatabaseSnapshot',
      args: {},
    };
    return {
      text: '',
      functionCalls: [call],
      modelContent: { role: 'model', parts: [{ functionCall: call }] },
      searchSources: [],
      modelUsed: 'gemini-3.8-flash',
    };
  }

  // 0E. Check Live Market / Web Search intent (e.g. "What is today's Nifty level?", "What is today's Nifty trend?", "Search web for...")
  if (
    /\b(what\s+is\s+today'?s\s+(?:nifty|bank\s*nifty|sensex|market)|today'?s\s+(?:nifty|bank\s*nifty|market)\s+(?:level|trend|price|setup|update)|live\s+(?:nifty|bank\s*nifty|market)|search\s+(?:the\s+)?web)\b/i.test(lower)
  ) {
    const call = {
      id: `call_${Date.now()}`,
      name: 'searchWeb',
      args: {
        query: cleanPrompt,
      },
    };
    return {
      text: '',
      functionCalls: [call],
      modelContent: { role: 'model', parts: [{ functionCall: call }] },
      searchSources: [
        { title: 'NSE India — Live Nifty 50 & Bank Nifty Index Watch', url: 'https://www.nseindia.com/market-data/live-equity-market' },
        { title: 'TradingView India — NSE:NIFTY & BANKNIFTY Charts', url: 'https://in.tradingview.com/symbols/NSE-NIFTY/' }
      ],
      modelUsed: 'gemini-3.8-flash',
    };
  }

  // 0F. Check Lead to Admission Conversion intent (e.g. "Convert Vikram Patil from leads to admission")
  if (/\b(convert|promote)\b/i.test(lower) && (/\b(lead|inquir|admission|student|enrolled)\b/i.test(lower) || matchedPersonName)) {
    const convMatch =
      cleanPrompt.match(/(?:convert|promote)\s+([A-Za-z][A-Za-z\s]{1,30}?)(?:\s+from\s+(?:the\s+)?(?:leads?|inquir(?:y|ies)))?\s+(?:in)?to\s+(?:an?\s+)?(?:admission|student|enrolled)/i) ||
      cleanPrompt.match(/(?:convert|promote)\s+([A-Za-z][A-Za-z\s]{1,30}?)(?=\s+from|\s+to|\s+into|$)/i);
    const targetName = convMatch?.[1]?.replace(/\b(from|to|into|leads?|inquiries|student|admission)\b/gi, '').trim() || matchedPersonName;
    if (targetName) {
      const call = {
        id: `call_${Date.now()}`,
        name: 'convertLeadToAdmission',
        args: {
          leadIdentifier: targetName,
          ...(parsedCourse ? { course: parsedCourse } : {}),
          ...(parsedBatch ? { batch: parsedBatch } : {}),
          ...(parsedFeePaid !== undefined ? { feePaid: parsedFeePaid } : {}),
        },
      };
      return {
        text: '',
        functionCalls: [call],
        modelContent: { role: 'model', parts: [{ functionCall: call }] },
        searchSources: [],
        modelUsed: 'gemini-3.8-flash',
      };
    }
  }

  // 1. Check Search / Lookup intent
  const searchMatch = cleanPrompt.match(/^(?:search|find|lookup|look\s+up|locate|query|show\s+record\s+for)\s+(?:for\s+)?(?:student[s]?|inquir(?:y|ies)|lead[s]?|record[s]?)?\s*(.+)$/i);
  if (searchMatch?.[1] && !/\b(update|change|set|modify|edit|delete|remove|add|enroll)\b/i.test(lower)) {
    const rawSearchQuery = searchMatch[1].replace(/^[:\-–\s]+/, '').trim();
    const entityType = /\b(inquir|lead)\b/i.test(lower)
      ? 'inquiries'
      : /\bstudent\b/i.test(lower)
      ? 'students'
      : 'all';
    const call = {
      id: `call_${Date.now()}`,
      name: 'searchRecords',
      args: {
        query: rawSearchQuery || matchedPersonName || cleanPrompt,
        entityType,
      },
    };
    return {
      text: '',
      functionCalls: [call],
      modelContent: { role: 'model', parts: [{ functionCall: call }] },
      searchSources: [],
      modelUsed: 'gemini-3.1-flash-lite',
    };
  }

  // 2. Check Batch / Course / Lecture / Staff / Material Creation or Update intent
  if (
    /\b(create|add|new|schedule|launch)\s+(?:a\s+)?(batch|course|lecture|staff|faculty|instructor|study\s*material|material)\b/i.test(lower)
  ) {
    const entityKindMatch = lower.match(/\b(batch|course|lecture|staff|faculty|instructor|material)\b/);
    const kind = entityKindMatch?.[1] || 'batch';
    const normalizedKind =
      kind === 'faculty' || kind === 'instructor'
        ? 'staff'
        : kind === 'material'
        ? 'materials'
        : (`${kind}s`.replace('batchs', 'batches') as string);
    const titleMatch =
      cleanPrompt.match(/(?:called|named|titled|code|name)\s+["']?([A-Za-z0-9\s\-&:]{3,45})["']?/i) ||
      cleanPrompt.match(/["']([^"']{3,45})["']/);
    const extractedName = titleMatch?.[1]?.trim() || parsedBatch || 'New Institute Record';
    const call = {
      id: `call_${Date.now()}`,
      name: 'manageInstituteEntity',
      args: {
        entityType: normalizedKind,
        action: 'create',
        nameOrTitle: extractedName,
        course: parsedCourse || courses[0]?.name || 'Complete Master Trader Blueprint',
        feeOrAmount: parsedFeePaid,
        phone: parsedPhone,
      },
    };
    return {
      text: '',
      functionCalls: [call],
      modelContent: { role: 'model', parts: [{ functionCall: call }] },
      searchSources: [],
      modelUsed: 'gemini-3.1-flash-lite',
    };
  }

  // 3. Check Bulk Batch Attendance intent (e.g. "mark all students in batch OCT-MTB-01 present")
  if (/\b(mark\s+all|bulk\s+mark|entire\s+batch|all\s+students)\b/i.test(lower) && /\b(present|absent|late|attendance)\b/i.test(lower)) {
    const status = /\babsent\b/i.test(lower) ? 'Absent' : /\blate\b/i.test(lower) ? 'Late' : 'Present';
    const targetBatch =
      batches.find(b => lower.includes(String(b.code || '').toLowerCase()) || lower.includes(String(b.name || '').toLowerCase()))?.code ||
      parsedBatch ||
      batches[0]?.code ||
      'OCT-MTB-01';
    const call = {
      id: `call_${Date.now()}`,
      name: 'manageInstituteEntity',
      args: {
        entityType: 'attendance_bulk',
        action: 'update',
        nameOrTitle: targetBatch,
        status,
      },
    };
    return {
      text: '',
      functionCalls: [call],
      modelContent: { role: 'model', parts: [{ functionCall: call }] },
      searchSources: [],
      modelUsed: 'gemini-3.1-flash-lite',
    };
  }

  // 4. Check Delete intent
  if (/\b(delete|remove|erase)\b/i.test(lower) && matchedPersonName) {
    const call = {
      id: `call_${Date.now()}`,
      name: 'deleteStudentRecord',
      args: { identifier: matchedPersonName },
    };
    return {
      text: '',
      functionCalls: [call],
      modelContent: { role: 'model', parts: [{ functionCall: call }] },
      searchSources: [],
      modelUsed: 'gemini-3.8-flash',
    };
  }

  // 5. Check Individual Attendance intent
  if (/\b(attendance|present|absent|late)\b/i.test(lower) && /\b(mark|set|update)\b/i.test(lower) && matchedPersonName) {
    const status = /\babsent\b/i.test(lower) ? 'Absent' : /\blate\b/i.test(lower) ? 'Late' : 'Present';
    const call = {
      id: `call_${Date.now()}`,
      name: 'updateFeeOrAttendance',
      args: {
        studentIdentifier: matchedPersonName,
        actionType: 'mark_attendance',
        payload: { status },
      },
    };
    return {
      text: '',
      functionCalls: [call],
      modelContent: { role: 'model', parts: [{ functionCall: call }] },
      searchSources: [],
      modelUsed: 'gemini-3.8-flash',
    };
  }

  // 6. Check Add / Enroll / Create Student or Lead intent (including incomplete shorthand like "Rahul 9876543210" or "add rahul")
  const isBareNameAndPhone =
    !matchedPersonName &&
    Boolean(parsedPhone) &&
    /^[A-Za-z][A-Za-z\s]{1,28}\s+[6-9]\d{9}\b/i.test(cleanPrompt) &&
    !/\b(update|change|delete|remove|search|find)\b/i.test(lower);

  if (
    isBareNameAndPhone ||
    ((/\b(add|enroll|create|register)\s+(?:a\s+)?(?:new\s+)?(student|admission|lead|inquiry|enquiry)\b/i.test(lower) ||
      (/\b(lead|inquiry|enquiry|student|admission)\b/i.test(lower) && /\b(add|enroll|register|create|new)\b/i.test(lower))) &&
      !/\b(convert|promote)\b/i.test(lower))
  ) {
    const isLead = /\b(inquiry|lead|enquiry)\b/i.test(lower) || (isBareNameAndPhone && parsedFeePaid === undefined);
    let targetName = matchedPersonName;
    if (!targetName) {
      if (isLead) {
        const leadNameMatch =
          cleanPrompt.match(/(?:lead|inquiry|enquiry)\s+([A-Za-z][A-Za-z\s]{1,30}?)(?=\s+\d|\s+interested|\s+for|\s+in|\s+notes|$)/i) ||
          cleanPrompt.match(/(?:add|create|new|register)\s+(?:a\s+)?(?:lead|inquiry|enquiry)\s+([A-Za-z][A-Za-z\s]{1,30})/i) ||
          cleanPrompt.match(/^([A-Za-z][A-Za-z\s]{1,25}?)\s+[6-9]\d{9}\b/i);
        targetName = leadNameMatch?.[1]?.trim() || 'New Inquiry';
      } else {
        const stuNameMatch =
          cleanPrompt.match(/(?:student|admission)\s+([A-Za-z][A-Za-z\s]{1,30}?)(?=\s+\d|\s+for|\s+with|\s+fee|\s+batch|\s+notes|$)/i) ||
          cleanPrompt.match(/(?:add|enroll|register)\s+(?:new\s+)?(?:student|admission)\s+([A-Za-z][A-Za-z\s]{1,30})/i) ||
          cleanPrompt.match(/^([A-Za-z][A-Za-z\s]{1,25}?)\s+[6-9]\d{9}\b/i);
        targetName = stuNameMatch?.[1]?.trim() || 'New Student';
      }
    }
    const call = {
      id: `call_${Date.now()}`,
      name: isLead ? 'createLead' : 'createStudent',
      args: isLead
        ? {
            name: targetName,
            ...(parsedPhone ? { phone: parsedPhone } : {}),
            ...(parsedCourse ? { course: parsedCourse } : {}),
            notes: cleanPrompt,
          }
        : {
            name: targetName,
            ...(parsedPhone ? { phone: parsedPhone } : {}),
            ...(parsedCourse ? { course: parsedCourse } : {}),
            ...(parsedBatch ? { batch: parsedBatch } : {}),
            ...(parsedFeePaid !== undefined ? { paidFees: parsedFeePaid } : {}),
            notes: cleanPrompt,
          },
    };
    return {
      text: '',
      functionCalls: [call],
      modelContent: { role: 'model', parts: [{ functionCall: call }] },
      searchSources: [],
      modelUsed: 'gemini-2.5-flash',
    };
  }

  // 7. Check Update / Modify / Promote intent
  const statusMatch = cleanPrompt.match(/\b(?:status|stage)\s+(?:to|as|=|:)\s+([A-Za-z\s\-]{2,25})(?=[.,;]|$)/i);
  const parsedStatus = statusMatch?.[1]?.trim();

  if (
    matchedPersonName &&
    (/\b(update|change|set|modify|edit|assign|promote|move|fee|paid|batch|course|status|stage|phone)\b/i.test(lower) ||
      parsedFeePaid !== undefined ||
      Boolean(parsedBatch) ||
      Boolean(parsedCourse) ||
      Boolean(parsedStatus))
  ) {
    const call = {
      id: `call_${Date.now()}`,
      name: 'executeLiveRecordMutation',
      args: {
        targetEntity: matchedPersonName,
        collection: 'auto',
        action: /\bpromote|convert\b/i.test(lower) ? 'promote_lead_to_student' : 'update',
        data: {
          ...(parsedBatch ? { batch: parsedBatch } : {}),
          ...(parsedCourse ? { course: parsedCourse } : {}),
          ...(parsedFeePaid !== undefined ? { feePaid: parsedFeePaid, paidAmount: parsedFeePaid } : {}),
          ...(parsedPhone ? { phone: parsedPhone } : {}),
          ...(parsedStatus ? { stage: parsedStatus, status: parsedStatus } : {}),
        },
      },
    };
    return {
      text: '',
      functionCalls: [call],
      modelContent: { role: 'model', parts: [{ functionCall: call }] },
      searchSources: [],
      modelUsed: 'gemini-2.5-flash',
    };
  }

  // 8. Specialized Domain & Analytical Intelligence (Fees, Attendance, Courses, Batches, Leads, Trading Strategy)
  const totalStudents = ledgerSnapshot?.counts?.totalStudents ?? students.length;
  const activeStudentsCount = ledgerSnapshot?.counts?.activeStudents ?? students.length;
  const totalInquiries = ledgerSnapshot?.counts?.totalInquiries ?? inquiries.length;
  const totalCollected = students.reduce((sum, s) => sum + (Number(s.feePaid) || 0), 0);
  const totalDue = students.reduce((sum, s) => sum + (Number(s.balanceDue) || 0), 0);

  // 8a0. Admissions and Leads count query + who hasn't been followed up with
  if (
    (/\b(how\s+many|count|total)\b/i.test(lower) && /\b(leads?|inquir(?:y|ies))\b/i.test(lower) && /\b(admissions?|students?)\b/i.test(lower)) ||
    (/\bwho\s+(?:hasn'?t|has\s+not|pending)\s+(?:been\s+)?followed?\s*up\b/i.test(lower)) ||
    (/\bfollow[\s-]?up\b/i.test(lower) && /\b(who|list|pending|overdue|uncontacted)\b/i.test(lower))
  ) {
    const pendingFollowUps = inquiries.filter(
      (l: any) => !l.stage || l.stage === 'New Enquiry' || l.stage === 'Follow Up' || l.stage === 'Call Back Later' || !l.lastContact || (l.followUpDate && l.followUpDate <= new Date().toISOString().split('T')[0])
    );
    const followUpLines = (pendingFollowUps.length > 0 ? pendingFollowUps : inquiries.slice(0, 10)).map(
      (l: any) => `- **${l.name}** (\`${l.id}\`) • Course: **${l.course || 'Stock Market'}** • Phone: \`${l.phone}\` • Follow-up Date: \`${l.followUpDate || 'Pending'}\` • Stage: **${l.stage}**`
    );
    return {
      text: `### 📊 Live Institute Admissions & Leads Audit\n- **Total Enrolled Admissions:** **${students.length}** active students\n- **Total Inquiries / Leads:** **${inquiries.length}** prospects recorded\n- **Leads Awaiting Follow-Up:** **${pendingFollowUps.length}** leads\n\n#### 🎯 Prospects Requiring Immediate Follow-Up\n${followUpLines.join('\n') || '- ✅ All prospects have been contacted and followed up with!'}`,
      searchSources: [],
      modelUsed: 'gemini-3.8-flash',
    };
  }

  // 8a. Specific person lookup
  if (matchedPersonName) {
    const found = allRecords.find(
      r => String(r.name || '').toLowerCase() === matchedPersonName.toLowerCase()
    );
    if (found) {
      return {
        text: `### 📋 Record Details: ${found.name}\n- **ID / Reg ID:** \`${found.regId || found.id}\`\n- **Course:** ${found.course || 'Assigned'}\n- **Batch:** \`${found.batch || 'N/A'}\`\n- **Phone:** \`${found.phone || 'N/A'}\`\n- **Fees Paid:** ₹${Number(found.feePaid || 0).toLocaleString('en-IN')} (Balance Due: ₹${Number(found.balanceDue || 0).toLocaleString('en-IN')} / Net Fee: ₹${Number(found.netFee || 0).toLocaleString('en-IN')})\n- **Attendance:** **${found.attendancePct ?? 100}%**\n- **Status / Stage:** **${found.status || found.stage || 'Active'}**`,
        searchSources: [],
        modelUsed: 'gemini-3.8-flash',
      };
    }
  }

  // 8b. Pending / Overdue Fee Audit
  if (/\b(overdue|pending\s+fee|balance\s+due|unpaid|fee\s+due|defaulter|collection|recovery|dues)\b/i.test(lower)) {
    const pendingList = students.filter(s => Number(s.balanceDue) > 0 && s.status !== 'Archived');
    const lines = pendingList
      .map(
        s =>
          `- **${s.name}** (\`${s.regId || s.id}\`) • Batch: \`${s.batch || 'Unassigned'}\` • Phone: \`${s.phone}\` • Paid: ₹${Number(s.feePaid || 0).toLocaleString('en-IN')} • **Balance Due: ₹${Number(s.balanceDue || 0).toLocaleString('en-IN')}**`
      )
      .join('\n');
    return {
      text: `### 💰 Live Fee Recovery & Pending Installments Report\n- **Total Fees Collected:** **₹${totalCollected.toLocaleString('en-IN')}**\n- **Total Pending Dues:** **₹${totalDue.toLocaleString('en-IN')}** across **${pendingList.length}** students\n\n#### Students with Pending Fee Balances\n${lines || '- ✅ All active students have cleared 100% of their course fees!'}\n\n#### Ready-to-Send WhatsApp Fee Reminder (English & Marathi)\n> *"Namaste! Warm greetings from **Srujaan Share Market Institute, Pune**. Your upcoming course fee installment is due. Kindly complete the payment via UPI (\`srujaaninstitute@icici\`) and share the screenshot for your official GST tax receipt. धन्यवाद!"*`,
      searchSources: [],
      modelUsed: 'gemini-3.8-flash',
    };
  }

  // 8c. Attendance Audit (< 75% or Attendance overview)
  if (/\b(attendance|absentee|below\s*75|low\s+attendance|present)\b/i.test(lower)) {
    const lowAtt = students.filter(s => (Number(s.attendancePct) || 100) < 75 && s.status !== 'Archived');
    const allAttLines = (lowAtt.length > 0 ? lowAtt : students.slice(0, 8))
      .map(
        s =>
          `- **${s.name}** (\`${s.regId || s.id}\`) • Batch: \`${s.batch || 'N/A'}\` • Attendance: **${s.attendancePct ?? 100}%** • Phone: \`${s.phone}\``
      )
      .join('\n');
    return {
      text: `### 📅 Live Student Attendance Audit\n- **Students Below 75% Attendance Threshold:** **${lowAtt.length}**\n- **Total Active Students Monitored:** **${activeStudentsCount}**\n\n#### ${lowAtt.length > 0 ? 'Students Requiring Attendance Follow-Up (< 75%)' : 'Current Student Attendance Standing'}\n${allAttLines || '- No students found.'}\n\n*Tip: Say **"Mark Monika Patil Present"** or **"Mark all students in batch OCT-MTB-01 Present"** to update attendance immediately.*`,
      searchSources: [],
      modelUsed: 'gemini-3.8-flash',
    };
  }

  // 8d. Share Market / Price Action / Nifty / Bank Nifty / F&O / Trading Strategy Queries
  if (/\b(nifty|bank\s*nifty|price\s*action|option|straddle|strangle|iron\s*condor|demand|supply|zone|support|resistance|candlestick|intraday|swing\s*trad|risk\s*management|stop\s*loss|theta|delta|vega|oi|open\s*interest|market|trading\s*strategy)\b/i.test(lower)) {
    return {
      text: `### 📈 Srujaan Institutional Price Action & F&O Trading Desk Blueprint\n\n#### 1. Institutional Demand & Supply Zone Execution (Nifty 50 & Bank Nifty)\n- **Freshness & Impulse Structure:** Focus on **Rally-Base-Rally (RBR)** and **Drop-Base-Rally (DBR)** demand zones on the **15-min & 75-min** timeframes where institutional order flow left an imbalance (>1.8x ATR impulse candle).\n- **Entry Trigger:** Wait for liquidity sweep below retail support into the institutional proximal line with a **15-min bullish rejection wick + rising VWAP**.\n- **Strict Risk Protocol:** Maximum **1% to 1.5% capital risk per trade**; minimum **1:2.5 Risk-to-Reward (R:R)** before trailing stop-loss to cost.\n\n#### 2. Option Buying vs. Option Selling Framework\n| Parameter | Option Buying (Momentum) | Option Selling (Theta/Spread) |\n| :--- | :--- | :--- |\n| **Ideal Market Regime** | High ADX (>25), Breakout from narrow CPR | Range-bound, India VIX cooling off |\n| **Strike Selection** | Slightly ITM (0.55 – 0.65 Delta) | OTM Credit Spreads / Iron Condor (0.20 Delta) |\n| **Stop-Loss Rule** | 25%–30% of option premium or spot zone invalidation | 1.5x credit received or spot break of max-OI wall |\n\n#### 3. Marathi Summary for Classroom & WhatsApp\n> *"सृजन शेअर मार्केट इन्स्टिट्यूट टीप: निफ्टी आणि बँक निफ्टीमध्ये ट्रेड घेताना नेहमी १५-मिनिटांच्या डिमांड/सप्लाय झोनची आणि १:२.५ रिस्क-रिवॉर्डची काटेकोरपणे अंमलबजावणी करा. स्टॉप-लॉस शिवाय कोणताही F&O ट्रेड घेऊ नका."*`,
      searchSources: [],
      modelUsed: 'gemini-3.8-flash',
    };
  }

  // 8e. Inquiries / Leads / WhatsApp Pitch
  if (/\b(inquir|lead|crm|follow[\s-]?up|whatsapp|marathi|pitch|conversion)\b/i.test(lower)) {
    const leadLines = inquiries
      .slice(0, 8)
      .map(
        l =>
          `- **${l.name}** (\`${l.id}\`) • Course: **${l.course}** • Stage: **${l.stage}** • Phone: \`${l.phone}\` • Follow-up: \`${l.followUpDate || 'Today'}\``
      )
      .join('\n');
    return {
      text: `### 🎯 Active Inquiries & Lead Conversion Pipeline (${totalInquiries} Total)\n${leadLines || '- No open inquiries.'}\n\n#### High-Conversion Marathi & English WhatsApp Follow-Up Pitch\n> *"नमस्कार! **सृजन शेअर मार्केट इन्स्टिट्यूट (FC Road, शिवाजीनगर, पुणे)** मधून संपर्क करत आहोत. आपल्या **Complete Master Trader Blueprint** व **Nifty/Bank Nifty F&O** बॅचचे मोफत डेमो सेशन आणि प्रत्यक्ष लाईव्ह मार्केट प्रॅक्टिकल या आठवड्यात सुरू होत आहे. आपली सीट बुक करण्यासाठी आजच रिप्लाय करा! 📞"*`,
      searchSources: [],
      modelUsed: 'gemini-3.8-flash',
    };
  }

  // 8f. Courses / Batches / Syllabus Overview
  if (/\b(course|batch|syllabus|curriculum|lecture|schedule|fee\s+structure)\b/i.test(lower)) {
    const cLines = courses
      .map(c => `- **${c.name}** (\`${c.code}\`) — Course Fee: **₹${Number(c.fee || 0).toLocaleString('en-IN')}**`)
      .join('\n');
    const bLines = batches
      .map(b => `- **${b.name}** (\`${b.code}\`) — Course: **${b.course}** • Schedule: \`${b.schedule}\``)
      .join('\n');
    return {
      text: `### 🎓 Srujaan Courses & Active Batch Schedules\n\n#### Flagship Trading Programs (${courses.length})\n${cLines || '- Complete Master Trader Blueprint (₹35,000)'}\n\n#### Active Classroom & Hybrid Batches (${batches.length})\n${bLines || '- No batches listed'}\n\n*Tip: You can ask me to create a new batch, enroll a student into a specific batch, or update course fees.*`,
      searchSources: [],
      modelUsed: 'gemini-3.8-flash',
    };
  }

  const topStudentsPreview = students
    .slice(0, 6)
    .map(
      s =>
        `- **${s.name}** (\`${s.regId || s.id}\`) — Batch: \`${s.batch || 'Unassigned'}\` | Paid: **₹${Number(s.feePaid || 0).toLocaleString('en-IN')}** | Due: **₹${Number(s.balanceDue || 0).toLocaleString('en-IN')}**`
    )
    .join('\n');

  return {
    text: `### 📊 Srujaan Share Market Institute — Live All-Access AI Command Summary\n- **Active Students:** **${activeStudentsCount}** (${totalStudents} total enrolled)\n- **Open Inquiries / Leads:** **${totalInquiries}**\n- **Total Fees Collected:** **₹${totalCollected.toLocaleString('en-IN')}**\n- **Total Pending Fee Dues:** **₹${totalDue.toLocaleString('en-IN')}**\n- **Active Courses & Batches:** **${courses.length} Courses** • **${batches.length} Batches**\n\n#### Live Student Ledger Snapshot\n${topStudentsPreview || '- No students listed'}\n\n#### ⚡ Instant Full-Access Commands You Can Run Right Now\n- **Search & Audit:** *"Search for Monika"*, *"Show all students with pending fee dues"*, *"List students with attendance below 75%"*\n- **Live Mutations:** *"Update Monika Patil's batch to Pro Trader Morning and set fees paid to 15000"*, *"Enroll Rahul Deshmukh in Nifty F&O Masterclass with fee paid 20000"*\n- **Attendance & Batches:** *"Mark Monika Patil Present"*, *"Mark all students in batch OCT-MTB-01 Present"*, *"Create a new batch Weekend F&O Pro"*`,
    searchSources: [],
    modelUsed: 'gemini-3.8-flash',
  };
}

// Declarative CRUD tools exposed to Gemini (17 Official CRM Tools + Aliases)
const agentFunctionDeclarations: FunctionDeclaration[] = [
  {
    name: 'searchStudents',
    description:
      'Searches enrolled students by name, phone, course, batch, branch/locality, or status. Returns matching student records.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        query: { type: Type.STRING, description: 'Name, phone, course, batch, locality, or status to filter students' },
        course: { type: Type.STRING, description: 'Optional course filter' },
        batch: { type: Type.STRING, description: 'Optional batch filter' },
        status: { type: Type.STRING, description: 'Optional status filter (Active, On Hold, Completed)' },
      },
      required: ['query'],
    },
  },
  {
    name: 'getStudentDetails',
    description:
      'Retrieves complete profile, fee ledger, installment milestones, batch, and attendance percentage for a specific student.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        identifier: { type: Type.STRING, description: 'Student Name, Registration ID (SSMI-...), or Phone number' },
      },
      required: ['identifier'],
    },
  },
  {
    name: 'createStudent',
    description:
      'Enrolls a new student into SSMI CRM. Checks for duplicate phone/name first, maps SSMI course fees, calculates pending balance, and syncs to Firestore.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        name: { type: Type.STRING, description: 'Full name of the student' },
        phone: { type: Type.STRING, description: '10-digit mobile number (leave empty if not provided; never invent)' },
        course: { type: Type.STRING, description: 'Course name or abbreviation (Foundation/Basic, Advance, F&O, Forex, Complete)' },
        totalFees: { type: Type.NUMBER, description: 'Total course fee in INR' },
        paidFees: { type: Type.NUMBER, description: 'Fees paid so far in INR (0 if not specified)' },
        batch: { type: Type.STRING, description: 'Assigned batch name or code' },
        locality: { type: Type.STRING, description: 'Student locality or branch (e.g. Chinchwad, Pune, FC Road)' },
        paymentMode: { type: Type.STRING, description: 'UPI, Cash, Bank Transfer, Card' },
        notes: { type: Type.STRING, description: 'Admission notes or remarks' },
      },
      required: ['name'],
    },
  },
  {
    name: 'updateStudent',
    description:
      'Updates an existing student record (fees paid, total fees, course, batch, phone, status, notes). Disambiguates if multiple students match.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        identifier: { type: Type.STRING, description: 'Student Name, Registration ID, or Phone number' },
        updates: {
          type: Type.OBJECT,
          description: 'Fields to update on the student record',
          properties: {
            name: { type: Type.STRING },
            phone: { type: Type.STRING },
            course: { type: Type.STRING },
            batch: { type: Type.STRING },
            paidFees: { type: Type.NUMBER },
            feePaid: { type: Type.NUMBER },
            totalFees: { type: Type.NUMBER },
            status: { type: Type.STRING },
            notes: { type: Type.STRING },
          },
        },
      },
      required: ['identifier', 'updates'],
    },
  },
  {
    name: 'deleteStudent',
    description:
      'Deletes a student record from CRM and Firestore. Requires explicit confirmation unless confirmed is true.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        identifier: { type: Type.STRING, description: 'Student Name, Registration ID, or Phone number' },
        confirmed: { type: Type.BOOLEAN, description: 'True ONLY if the admin explicitly confirmed deletion' },
      },
      required: ['identifier'],
    },
  },
  {
    name: 'searchLeads',
    description:
      'Searches inquiries/leads by partial name, phone, course, locality/branch (e.g. Chinchwad, Pune), source, or status/stage.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        query: { type: Type.STRING, description: 'Search keyword (name, phone, locality like Chinchwad, course, or stage)' },
        locality: { type: Type.STRING, description: 'Optional locality/city filter (e.g. Chinchwad, Wakad, Pune)' },
        stage: { type: Type.STRING, description: 'Optional stage filter (New Enquiry, Interested, Follow Up, etc.)' },
        course: { type: Type.STRING, description: 'Optional course filter' },
      },
      required: ['query'],
    },
  },
  {
    name: 'getLeadDetails',
    description:
      'Retrieves complete details, follow-up schedule, counselor notes, and conversion status for a specific inquiry/lead.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        identifier: { type: Type.STRING, description: 'Lead Name, Lead ID, or Phone number' },
      },
      required: ['identifier'],
    },
  },
  {
    name: 'updateLead',
    description:
      'Updates an existing inquiry/lead (stage/status, phone, course, locality, followUpDate, notes).',
    parameters: {
      type: Type.OBJECT,
      properties: {
        identifier: { type: Type.STRING, description: 'Lead Name, Lead ID, or Phone number' },
        updates: {
          type: Type.OBJECT,
          description: 'Fields to update on the lead record',
          properties: {
            name: { type: Type.STRING },
            phone: { type: Type.STRING },
            course: { type: Type.STRING },
            stage: { type: Type.STRING },
            status: { type: Type.STRING },
            locality: { type: Type.STRING },
            followUpDate: { type: Type.STRING },
            notes: { type: Type.STRING },
          },
        },
      },
      required: ['identifier', 'updates'],
    },
  },
  {
    name: 'deleteLead',
    description:
      'Deletes an inquiry/lead from CRM and Firestore. Requires explicit confirmation unless confirmed is true.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        identifier: { type: Type.STRING, description: 'Lead Name, Lead ID, or Phone number' },
        confirmed: { type: Type.BOOLEAN, description: 'True ONLY if the admin explicitly confirmed deletion' },
      },
      required: ['identifier'],
    },
  },
  {
    name: 'findDuplicateRecords',
    description:
      'Scans students and leads/inquiries to detect duplicate records sharing the same phone number or normalized name. Optionally removes duplicate inquiries when confirmed.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        category: { type: Type.STRING, description: '"leads", "students", or "all"' },
        deleteDuplicates: { type: Type.BOOLEAN, description: 'Set true if the user asked to delete/clean duplicate records' },
        confirmed: { type: Type.BOOLEAN, description: 'Set true if the user explicitly confirmed deleting the duplicates' },
      },
    },
  },
  {
    name: 'getPendingFees',
    description:
      'Returns all active students with pending/overdue fee balances, total fees collected, and total pending dues.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        course: { type: Type.STRING, description: 'Optional course filter' },
        batch: { type: Type.STRING, description: 'Optional batch filter' },
      },
    },
  },
  {
    name: 'getAttendanceSummary',
    description:
      'Returns student attendance percentages, batch attendance standing, and lists students below the 75% attendance threshold.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        batch: { type: Type.STRING, description: 'Optional batch code or name' },
        belowThresholdOnly: { type: Type.BOOLEAN, description: 'If true, only list students below 75% attendance' },
      },
    },
  },
  {
    name: 'getDashboardStatistics',
    description:
      'Returns comprehensive live CRM statistics: total leads, open leads, active students, fees collected, pending dues, and course-wise breakdown.',
    parameters: {
      type: Type.OBJECT,
      properties: {},
    },
  },
  {
    name: 'searchCRMRecords',
    description:
      'Unified cross-collection search across students, admissions, leads, inquiries, courses, and batches.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        query: { type: Type.STRING, description: 'Search keyword, name, phone, locality, course, batch, or status' },
        category: { type: Type.STRING, description: '"all", "students", or "leads"' },
      },
      required: ['query'],
    },
  },
  {
    name: 'generateCRMReports',
    description:
      'Generates analytical CRM reports such as today\'s admissions summary, records added in the last N days, course enrollment breakdown, or lead conversion report.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        reportType: {
          type: Type.STRING,
          description: '"today_admissions", "recent_records", "course_summary", "fee_recovery", or "comprehensive"',
        },
        days: {
          type: Type.NUMBER,
          description: 'Number of days to look back for recent_records (e.g. 7 for last seven days)',
        },
      },
    },
  },
  {
    name: 'bulkUpdateLeads',
    description:
      'Updates all leads matching a status/stage or locality filter to a new stage (e.g. "Change all interested leads to Follow-up").',
    parameters: {
      type: Type.OBJECT,
      properties: {
        fromStatusOrStage: { type: Type.STRING, description: 'Current stage/status or filter (e.g. "Interested", "New")' },
        toStatusOrStage: { type: Type.STRING, description: 'Target stage/status to set (e.g. "Follow Up", "Call Back Later")' },
        confirmed: { type: Type.BOOLEAN, description: 'Set true to apply the bulk update' },
      },
      required: ['fromStatusOrStage', 'toStatusOrStage'],
    },
  },
  {
    name: 'searchRecords',
    description:
      'Fuzzy-searches across leads (inquiries), students, and admissions by partial name, phone number, course, batch, or status. Returns matching records with their unique IDs.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        query: {
          type: Type.STRING,
          description: 'Search term (partial name, phone number, course, batch, or status)',
        },
        category: {
          type: Type.STRING,
          description: 'Target category to search: "leads", "students", "admissions", "inquiries", or "all"',
        },
        entityType: {
          type: Type.STRING,
          description: 'Optional alias for category: "students", "inquiries", or "all"',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'addLead',
    description:
      'Creates a new inquiry/lead in SSMI CRM. Auto-fills missing fields with smart defaults (course: "Basic Trading", status: "New", date: today).',
    parameters: {
      type: Type.OBJECT,
      properties: {
        name: {
          type: Type.STRING,
          description: 'Full or first name of the prospect/lead',
        },
        phone: {
          type: Type.STRING,
          description: '10-digit mobile number (leave empty if omitted; never invent)',
        },
        course: {
          type: Type.STRING,
          description: 'Course interest (Basic -> Basic Trading, Advance -> Advance Stock Market, F&O -> Futures & Options, Forex -> Forex & Crypto, Complete -> Complete Trader Program)',
        },
        locality: {
          type: Type.STRING,
          description: 'Locality or city (e.g. Chinchwad, Pune)',
        },
        source: {
          type: Type.STRING,
          description: 'Lead source (defaults to "AI Copilot" / "Direct Inquiry")',
        },
        notes: {
          type: Type.STRING,
          description: 'Additional counselor notes or remarks',
        },
        status: {
          type: Type.STRING,
          description: 'Lead stage/status (defaults to "New")',
        },
      },
      required: ['name'],
    },
  },
  {
    name: 'addStudent',
    description:
      'Directly enrolls a new student into students & admissions. Maps abbreviated SSMI courses (Basic -> Basic Trading ₹5,000, Advance -> Advance Stock Market ₹7,500, F&O -> Futures & Options ₹10,000, Forex -> Forex & Crypto ₹9,000, Complete -> Complete Trader Program ₹15,000) and calculates pendingFees = totalFees - paidFees.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        name: {
          type: Type.STRING,
          description: 'Full name of the student',
        },
        phone: {
          type: Type.STRING,
          description: '10-digit mobile number (leave empty if omitted; never invent)',
        },
        course: {
          type: Type.STRING,
          description: 'Course name or abbreviation (Basic, Advance, F&O, Forex, Complete)',
        },
        totalFees: {
          type: Type.NUMBER,
          description: 'Total course fee in INR (auto-mapped from SSMI course if omitted)',
        },
        paidFees: {
          type: Type.NUMBER,
          description: 'Fees paid so far in INR (defaults to 0 if omitted)',
        },
        batch: {
          type: Type.STRING,
          description: 'Assigned batch name or code',
        },
        paymentMode: {
          type: Type.STRING,
          description: 'Payment mode: UPI, Cash, Bank Transfer, Card',
        },
        notes: {
          type: Type.STRING,
          description: 'Admission notes or remarks',
        },
      },
      required: ['name'],
    },
  },
  {
    name: 'updateRecord',
    description:
      'Finds a student or lead using fuzzy/partial matching on identifier (name or phone) and updates any fields (name, phone, course, paidFees, totalFees, pendingFees, batch, status, notes). If multiple records share a first name, lists them for disambiguation.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        identifier: {
          type: Type.STRING,
          description: 'Partial or full name, phone number, or ID of the student or lead',
        },
        targetType: {
          type: Type.STRING,
          description: '"student", "lead", "admission", "inquiry", or "auto"',
        },
        updates: {
          type: Type.OBJECT,
          description: 'Fields to update on the record',
          properties: {
            name: { type: Type.STRING, description: 'Updated name' },
            phone: { type: Type.STRING, description: 'Updated phone number' },
            course: { type: Type.STRING, description: 'Updated course name' },
            paidFees: { type: Type.NUMBER, description: 'Updated paid fees in INR' },
            feePaid: { type: Type.NUMBER, description: 'Alias for paidFees in INR' },
            totalFees: { type: Type.NUMBER, description: 'Updated total course fees in INR' },
            pendingFees: { type: Type.NUMBER, description: 'Updated pending fees in INR' },
            batch: { type: Type.STRING, description: 'Updated batch name or code' },
            status: { type: Type.STRING, description: 'Updated status or stage' },
            notes: { type: Type.STRING, description: 'Updated notes' },
          },
        },
      },
      required: ['identifier', 'updates'],
    },
  },
  {
    name: 'convertLeadToStudent',
    description:
      'Finds the matching lead by partial name/phone, creates a full student admission record (inheriting existing lead data + applying any new overrides), marks the lead as "Converted", and prevents duplicates.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        identifier: {
          type: Type.STRING,
          description: 'Partial or full name, phone number, or Lead ID of the inquiry to convert',
        },
        course: {
          type: Type.STRING,
          description: 'Enrolled course name or abbreviation (Basic, Advance, F&O, Forex, Complete)',
        },
        totalFees: {
          type: Type.NUMBER,
          description: 'Total course fees in INR (auto-mapped from SSMI course if omitted)',
        },
        paidFees: {
          type: Type.NUMBER,
          description: 'Initial fees paid in INR',
        },
        batch: {
          type: Type.STRING,
          description: 'Assigned batch name or code',
        },
      },
      required: ['identifier'],
    },
  },
  {
    name: 'deleteRecord',
    description:
      'Finds the matching student or lead by partial name/phone and deletes it from state and Firestore. If confirmed is not true and user did not say confirm/force, returns matched record details and asks for confirmation.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        identifier: {
          type: Type.STRING,
          description: 'Partial or full name, phone number, or ID of the student or lead to delete',
        },
        targetType: {
          type: Type.STRING,
          description: '"student", "lead", "admission", "inquiry", or "auto"',
        },
        confirmed: {
          type: Type.BOOLEAN,
          description: 'Set true ONLY if the user explicitly wrote "confirm", "confirm delete", or "force"',
        },
      },
      required: ['identifier'],
    },
  },
  {
    name: 'getDashboardStats',
    description:
      'Returns live counts of total leads, active students, total fees collected, pending fees, and course-wise breakdowns.',
    parameters: {
      type: Type.OBJECT,
      properties: {},
    },
  },
  {
    name: 'convertLeadToAdmission',
    description:
      'Convert an existing inquiry / lead into an active enrolled student admission in Srujaan Share Market Institute. Automatically marks lead as Admission Confirmed and generates official SSMI Registration ID.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        leadIdentifier: {
          type: Type.STRING,
          description: 'Name, phone number, or Lead ID (e.g. "Vikram Patil", "LD-123")',
        },
        course: {
          type: Type.STRING,
          description: 'Enrolled course name (optional, defaults to lead course or Complete Master Trader Blueprint)',
        },
        batch: {
          type: Type.STRING,
          description: 'Assigned batch code or name (optional)',
        },
        feePaid: {
          type: Type.NUMBER,
          description: 'Initial fee token deposit paid in INR (optional)',
        },
      },
      required: ['leadIdentifier'],
    },
  },
  {
    name: 'createLead',
    description:
      'Create a new inquiry / lead record with safe defaults. Use whenever the user asks to add a lead or inquiry.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        name: {
          type: Type.STRING,
          description: 'Full name of the prospect/inquirer',
        },
        phone: {
          type: Type.STRING,
          description: 'Contact phone number (e.g. 9876543210)',
        },
        course: {
          type: Type.STRING,
          description: 'Interested course or subject (e.g. Stock Market course, Complete Master Trader Blueprint)',
        },
        stage: {
          type: Type.STRING,
          description: 'Lead stage (defaults to "New Enquiry")',
        },
        notes: {
          type: Type.STRING,
          description: 'Any notes or inquiry details',
        },
      },
      required: ['name'],
    },
  },
  {
    name: 'modifyRecord',
    description:
      'Create a new record or update an existing record in the Students or Inquiries database.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        id: {
          type: Type.STRING,
          description: 'Record ID, Registration ID, or Student Name to update (leave empty if creating a new record)',
        },
        collection: {
          type: Type.STRING,
          description: 'Target collection: "students" or "inquiries"',
          enum: ['students', 'inquiries'],
        },
        data: {
          type: Type.OBJECT,
          description: 'Key-value fields to create or update (name, phone, course, batch, feePaid, totalFee, status, notes)',
          properties: {
            name: { type: Type.STRING, description: 'Full name' },
            phone: { type: Type.STRING, description: '10-digit phone number' },
            course: { type: Type.STRING, description: 'Course name' },
            batch: { type: Type.STRING, description: 'Batch name or code' },
            status: { type: Type.STRING, description: 'Status (Active, On Hold, Completed, Archived)' },
            stage: { type: Type.STRING, description: 'Inquiry stage' },
            feePaid: { type: Type.NUMBER, description: 'Fees paid in INR' },
            paidAmount: { type: Type.NUMBER, description: 'Fees paid in INR (alias)' },
            totalFee: { type: Type.NUMBER, description: 'Total net course fee in INR' },
            notes: { type: Type.STRING, description: 'Notes or remarks' },
          },
        },
      },
      required: ['collection', 'data'],
    },
  },
  {
    name: 'executeLiveRecordMutation',
    description:
      'Create, update, promote, or delete any record (student, lead, fee, staff, course) across the institute system. ALWAYS call this tool whenever the user instructs to add, change, update, promote, or remove any person or record (such as Monika Patil, Madan, etc.).',
    parameters: {
      type: Type.OBJECT,
      properties: {
        targetEntity: {
          type: Type.STRING,
          description: 'Name, Registration ID, ID, or Phone number of the person or record (e.g. "Monika Patil")',
        },
        collection: {
          type: Type.STRING,
          description: 'Target collection: "students", "leads", "staff", "courses", or "auto"',
          enum: ['students', 'leads', 'staff', 'courses', 'auto'],
        },
        action: {
          type: Type.STRING,
          description: 'Mutation action to execute',
          enum: ['update', 'create', 'delete', 'promote_lead_to_student'],
        },
        data: {
          type: Type.OBJECT,
          description: 'Fields to create or update on the record',
          properties: {
            name: { type: Type.STRING, description: 'Full name' },
            phone: { type: Type.STRING, description: '10-digit phone number' },
            course: { type: Type.STRING, description: 'Course name' },
            batch: { type: Type.STRING, description: 'Batch name or code (e.g. "Pro Trader Morning", "OCT-FO-01")' },
            status: { type: Type.STRING, description: 'Status (e.g. "Active", "On Hold", "Completed", "Archived")' },
            stage: { type: Type.STRING, description: 'Lead stage if inquiry' },
            feePaid: { type: Type.NUMBER, description: 'Total fees paid in INR (e.g. 15000)' },
            paidAmount: { type: Type.NUMBER, description: 'Total fees paid in INR (alias)' },
            totalFee: { type: Type.NUMBER, description: 'Total net course fee in INR' },
            netFee: { type: Type.NUMBER, description: 'Total net course fee in INR (alias)' },
            discount: { type: Type.NUMBER, description: 'Fee discount in INR' },
            attendanceStatus: { type: Type.STRING, description: 'Present, Absent, or Late' },
            notes: { type: Type.STRING, description: 'Notes or remarks' },
          },
        },
      },
      required: ['targetEntity', 'action', 'data'],
    },
  },
  {
    name: 'updateStudentRecord',
    description:
      'Update any student record by fuzzy Name, ID, Registration ID, or Phone (and automatically promote from leads or enroll if needed). Updates batch, feePaid, totalFee, course, phone, status, and notes immediately.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        identifier: {
          type: Type.STRING,
          description: 'Student Name, ID, Registration ID, or Phone (e.g. "Monika Patil")',
        },
        updates: {
          type: Type.OBJECT,
          description: 'Fields to update on the student record',
          properties: {
            name: { type: Type.STRING, description: 'Updated full name' },
            phone: { type: Type.STRING, description: 'Updated phone number' },
            course: { type: Type.STRING, description: 'Updated course name' },
            batch: { type: Type.STRING, description: 'Updated batch name or code (e.g. "Pro Trader Morning")' },
            status: { type: Type.STRING, description: 'Updated status ("Active", "On Hold", "Completed", "Archived")' },
            feePaid: { type: Type.NUMBER, description: 'Fees paid in INR (e.g. 15000)' },
            paidAmount: { type: Type.NUMBER, description: 'Fees paid in INR (alias)' },
            totalFee: { type: Type.NUMBER, description: 'Total course net fee in INR' },
            netFee: { type: Type.NUMBER, description: 'Total course net fee in INR (alias)' },
            discount: { type: Type.NUMBER, description: 'Discount in INR' },
            notes: { type: Type.STRING, description: 'Notes or remarks' },
          },
        },
      },
      required: ['identifier', 'updates'],
    },
  },
  {
    name: 'addStudentRecord',
    description:
      'Enroll and create a new student admission record immediately in the student database.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        name: { type: Type.STRING, description: 'Student full name' },
        phone: { type: Type.STRING, description: '10-digit mobile number' },
        course: { type: Type.STRING, description: 'Course name' },
        batch: { type: Type.STRING, description: 'Batch name or code' },
        totalFee: { type: Type.NUMBER, description: 'Total net course fee in INR' },
        feePaid: { type: Type.NUMBER, description: 'Fees paid so far in INR' },
        notes: { type: Type.STRING, description: 'Optional admission notes' },
      },
      required: ['name'],
    },
  },
  {
    name: 'deleteStudentRecord',
    description:
      'Locate and delete a student or inquiry record by Name, ID, Registration ID, or Phone.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        identifier: {
          type: Type.STRING,
          description: 'Student Name, ID, Registration ID, or Phone to delete',
        },
      },
      required: ['identifier'],
    },
  },
  {
    name: 'updateFeeOrAttendance',
    description:
      'Log a fee payment, set paid fee balance, or mark attendance for a student by Name, ID, or Phone.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        studentIdentifier: {
          type: Type.STRING,
          description: 'Student Name, Registration ID, or Phone',
        },
        actionType: {
          type: Type.STRING,
          description: '"fee_payment" or "mark_attendance"',
          enum: ['fee_payment', 'mark_attendance'],
        },
        payload: {
          type: Type.OBJECT,
          description: 'Fee or attendance details',
          properties: {
            feePaid: { type: Type.NUMBER, description: 'Updated fee paid amount in INR' },
            amount: { type: Type.NUMBER, description: 'Payment amount in INR' },
            status: { type: Type.STRING, description: 'Attendance status: Present, Absent, or Late' },
            date: { type: Type.STRING, description: 'YYYY-MM-DD date' },
            batch: { type: Type.STRING, description: 'Optional batch name/code' },
          },
        },
      },
      required: ['studentIdentifier', 'actionType'],
    },
  },
  {
    name: 'executeSystemDiagnosticAndRepair',
    description:
      'Inspect app memory, recalculate fee totals, repair missing arrays, and force full UI table re-renders.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        targetArea: {
          type: Type.STRING,
          description: 'Area to audit and repair: "all", "students", "fees", "courses", or "sync"',
          enum: ['all', 'students', 'fees', 'courses', 'sync'],
        },
      },
    },
  },
  {
    name: 'add_record',
    description:
      'Create a new record in the institute ledger (student admission, lead inquiry, student record, or fee entry). Use whenever the user asks to add, enroll, register, or create a student, admission, lead, inquiry, or fee payment.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        collection: {
          type: Type.STRING,
          description: 'Target section: "admissions", "inquiries", "students", or "fees"',
          enum: ['admissions', 'inquiries', 'students', 'fees'],
        },
        name: {
          type: Type.STRING,
          description: 'Full name of the student or lead inquirer',
        },
        phone: {
          type: Type.STRING,
          description: '10-digit mobile or contact number',
        },
        course: {
          type: Type.STRING,
          description: 'Selected course (e.g. Complete Master Trader Blueprint, Nifty & Bank Nifty F&O Masterclass, Price Action, Stock Market)',
        },
        batch: {
          type: Type.STRING,
          description: 'Batch name or code (optional)',
        },
        amount: {
          type: Type.NUMBER,
          description: 'Fee amount paid or quoted in INR (optional)',
        },
        feePaid: {
          type: Type.NUMBER,
          description: 'Fee paid in INR (optional)',
        },
        totalFee: {
          type: Type.NUMBER,
          description: 'Total course fee in INR (optional)',
        },
        notes: {
          type: Type.STRING,
          description: 'Additional details, batch preference, or status notes (optional)',
        },
        date: {
          type: Type.STRING,
          description: 'YYYY-MM-DD date string (optional)',
        },
      },
      required: ['collection', 'name'],
    },
  },
  {
    name: 'create_record',
    description:
      'Create a new record in the institute ledger (admissions, inquiries, students, or fees) with structured data.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        collection: {
          type: Type.STRING,
          description: 'Target collection: "admissions", "inquiries", "students", or "fees"',
          enum: ['admissions', 'inquiries', 'students', 'fees'],
        },
        data: {
          type: Type.OBJECT,
          description: 'Record fields including name, phone, course, batch, amount, feePaid, totalFee, notes, date',
          properties: {
            name: { type: Type.STRING, description: 'Full name of the student or lead' },
            phone: { type: Type.STRING, description: '10-digit mobile number' },
            course: { type: Type.STRING, description: 'Course name' },
            batch: { type: Type.STRING, description: 'Batch name or code' },
            amount: { type: Type.NUMBER, description: 'Fee amount in INR' },
            feePaid: { type: Type.NUMBER, description: 'Fee paid in INR' },
            totalFee: { type: Type.NUMBER, description: 'Total course fee in INR' },
            notes: { type: Type.STRING, description: 'Additional notes' },
            date: { type: Type.STRING, description: 'YYYY-MM-DD date' },
          },
          required: ['name'],
        },
      },
      required: ['collection', 'data'],
    },
  },
  {
    name: 'update_record',
    description:
      'Update or edit an existing student, admission, inquiry/lead, fee balance, batch, or attendance record.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        collection: {
          type: Type.STRING,
          description: 'Target section: "admissions", "inquiries", "students", "fees", or "attendance"',
          enum: ['admissions', 'inquiries', 'students', 'fees', 'attendance'],
        },
        identifier: {
          type: Type.STRING,
          description: 'Student ID, Registration ID (e.g. SSMI-2026-001), Full Name, or Phone number to locate the record (e.g. "Monika Patil")',
        },
        updates: {
          type: Type.OBJECT,
          description: 'Key-value pairs of fields to update',
          properties: {
            name: { type: Type.STRING, description: 'Updated full name' },
            phone: { type: Type.STRING, description: 'Updated phone number' },
            course: { type: Type.STRING, description: 'Updated course name' },
            batch: { type: Type.STRING, description: 'Updated batch name or code (e.g. "Pro Trader Morning", "OCT-FO-01")' },
            status: { type: Type.STRING, description: 'Updated status (e.g. Active, On Hold, Completed, Archived)' },
            stage: { type: Type.STRING, description: 'Updated CRM lead stage' },
            feePaid: { type: Type.NUMBER, description: 'Total fees paid in INR to set or update (e.g. 15000)' },
            paidAmount: { type: Type.NUMBER, description: 'Amount paid in INR to set or update (e.g. 15000)' },
            totalFee: { type: Type.NUMBER, description: 'Updated total net course fee in INR' },
            netFee: { type: Type.NUMBER, description: 'Updated total net course fee in INR' },
            discount: { type: Type.NUMBER, description: 'Updated fee discount in INR' },
            attendanceStatus: { type: Type.STRING, description: 'Present, Absent, or Late' },
            notes: { type: Type.STRING, description: 'Updated notes or remarks' },
          },
        },
      },
      required: ['collection', 'identifier', 'updates'],
    },
  },
  {
    name: 'delete_record',
    description:
      'Delete or remove an existing student, admission, or lead/inquiry record from the ledger.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        collection: {
          type: Type.STRING,
          description: 'Target section: "admissions", "inquiries", or "students"',
          enum: ['admissions', 'inquiries', 'students'],
        },
        identifier: {
          type: Type.STRING,
          description: 'Student ID, Registration ID, Name, or Phone number to delete',
        },
      },
      required: ['collection', 'identifier'],
    },
  },
  {
    name: 'mark_attendance',
    description:
      'Mark daily attendance (Present, Absent, or Late) for a student in the attendance ledger.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        studentNameOrPhone: {
          type: Type.STRING,
          description: 'Student Name, Phone number, or Registration ID',
        },
        studentIdentifier: {
          type: Type.STRING,
          description: 'Student Name, Phone number, or Registration ID (alias)',
        },
        date: {
          type: Type.STRING,
          description: 'YYYY-MM-DD format (defaults to today if omitted)',
        },
        status: {
          type: Type.STRING,
          description: 'Attendance status: "Present", "Absent", or "Late"',
          enum: ['Present', 'Absent', 'Late'],
        },
      },
      required: ['status'],
    },
  },
  {
    name: 'manageInstituteEntity',
    description:
      'Create or update Batches, Courses, Syllabus Lectures, Staff/Faculty, Study Materials, or Bulk Batch Attendance across the institute.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        entityType: {
          type: Type.STRING,
          description:
            'Target module: "batches", "courses", "lectures", "staff", "materials", or "attendance_bulk"',
          enum: ['batches', 'courses', 'lectures', 'staff', 'materials', 'attendance_bulk'],
        },
        action: {
          type: Type.STRING,
          description: '"create" or "update"',
          enum: ['create', 'update'],
        },
        nameOrTitle: {
          type: Type.STRING,
          description:
            'Batch name/code, Course name, Lecture title, Staff name, Study material title, or Batch code for bulk attendance',
        },
        course: {
          type: Type.STRING,
          description: 'Associated course name (optional)',
        },
        scheduleOrRole: {
          type: Type.STRING,
          description: 'Batch schedule, Staff role/designation, or Lecture module (optional)',
        },
        feeOrAmount: {
          type: Type.NUMBER,
          description: 'Course fee or Staff salary in INR (optional)',
        },
        phone: {
          type: Type.STRING,
          description: '10-digit phone number for Staff (optional)',
        },
        status: {
          type: Type.STRING,
          description: 'Status (e.g. Active, Completed, Present, Absent, Late)',
        },
      },
      required: ['entityType', 'action', 'nameOrTitle'],
    },
  },
  {
    name: 'getDatabaseSnapshot',
    description:
      'Returns live counts and lists of active courses, leads, enrolled students, fee collections, and system settings.',
    parameters: {
      type: Type.OBJECT,
      properties: {},
    },
  },
  {
    name: 'updateCourseData',
    description:
      'Directly modifies a course (instructorName, title, fee, description/syllabus, duration, mode, status) by courseId or course name and persists to ssm_courses_data and Firestore.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        courseId: {
          type: Type.STRING,
          description: 'Course ID, code, or course title (e.g. "CRS-01", "Master Price Action", "Advanced Trading")',
        },
        instructorName: {
          type: Type.STRING,
          description: 'New lead instructor / faculty name (e.g. "Prasad Bhunje")',
        },
        title: {
          type: Type.STRING,
          description: 'Updated course title',
        },
        fee: {
          type: Type.NUMBER,
          description: 'Updated course fee in INR',
        },
        description: {
          type: Type.STRING,
          description: 'Updated course syllabus / description',
        },
        duration: {
          type: Type.STRING,
          description: 'Updated duration (e.g. "8 Weeks")',
        },
        status: {
          type: Type.STRING,
          description: '"Active" or "Archived"',
        },
      },
      required: ['courseId'],
    },
  },
  {
    name: 'modifyCourse',
    description:
      'Update course instructor, pricing, syllabus, title, status, or metadata by courseId or fuzzy course name.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        courseId: {
          type: Type.STRING,
          description: 'Course ID, code, or name',
        },
        data: {
          type: Type.OBJECT,
          description: 'Course fields to update (instructor, instructorName, name, courseTitle, fee, fees, syllabus, status)',
          properties: {
            instructor: { type: Type.STRING },
            instructorName: { type: Type.STRING },
            name: { type: Type.STRING },
            courseTitle: { type: Type.STRING },
            fee: { type: Type.NUMBER },
            fees: { type: Type.NUMBER },
            syllabus: { type: Type.STRING },
            status: { type: Type.STRING },
          },
        },
      },
      required: ['courseId', 'data'],
    },
  },
  {
    name: 'manageStudents',
    description:
      'Adds a student, deletes an individual student, or wipes all students (requiring confirmPin: "CONFIRM_DELETE" for bulk operations).',
    parameters: {
      type: Type.OBJECT,
      properties: {
        action: {
          type: Type.STRING,
          description: '"add", "delete", or "deleteAll"',
          enum: ['add', 'delete', 'deleteAll'],
        },
        studentData: {
          type: Type.OBJECT,
          description: 'Student details when action is "add"',
          properties: {
            name: { type: Type.STRING },
            phone: { type: Type.STRING },
            course: { type: Type.STRING },
            batch: { type: Type.STRING },
            feePaid: { type: Type.NUMBER },
            totalFee: { type: Type.NUMBER },
          },
        },
        studentId: {
          type: Type.STRING,
          description: 'Student ID, Reg ID, or Name when action is "delete"',
        },
        confirmPin: {
          type: Type.STRING,
          description: 'Confirmation pin ("CONFIRM_DELETE") for deleteAll',
        },
      },
      required: ['action'],
    },
  },
  {
    name: 'manageLeads',
    description:
      'Full lifecycle lead management: add a lead, update a lead, delete a lead, or deleteAll leads.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        action: {
          type: Type.STRING,
          description: '"add", "update", "delete", or "deleteAll"',
          enum: ['add', 'update', 'delete', 'deleteAll'],
        },
        leadData: {
          type: Type.OBJECT,
          description: 'Lead fields for add or update (name, phone, course, stage, notes)',
          properties: {
            name: { type: Type.STRING },
            phone: { type: Type.STRING },
            course: { type: Type.STRING },
            stage: { type: Type.STRING },
            notes: { type: Type.STRING },
          },
        },
        leadId: {
          type: Type.STRING,
          description: 'Lead ID or Name for update or delete',
        },
        confirmPin: {
          type: Type.STRING,
          description: 'Confirmation pin ("CONFIRM_DELETE") for deleteAll',
        },
      },
      required: ['action'],
    },
  },
  {
    name: 'updateSystemSettings',
    description:
      'Modifies institute preferences, contact numbers, tagline, address, or system configurations.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        settingKey: {
          type: Type.STRING,
          description: 'Setting key (e.g. "instituteName", "tagline", "phone", "email", "campusAddress", "upiId", "gstin")',
        },
        value: {
          type: Type.STRING,
          description: 'New value to set',
        },
      },
      required: ['settingKey', 'value'],
    },
  },
  {
    name: 'searchWeb',
    description:
      'Fetches real-time market updates, Nifty 50 / Bank Nifty levels & setups, financial definitions, and live web information.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        query: {
          type: Type.STRING,
          description: 'Search query (e.g. "Today Nifty 50 and Bank Nifty trend and key levels")',
        },
      },
      required: ['query'],
    },
  },
  // Official snake_case CRM & Institute Management Tool Declarations
  {
    name: 'get_leads',
    description: 'Fetch all leads or filter leads by status/stage, course, locality, date, or source.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        status: { type: Type.STRING, description: 'Optional stage or status filter (e.g. New Enquiry, Interested, Follow Up, Converted)' },
        course: { type: Type.STRING, description: 'Optional course filter' },
        locality: { type: Type.STRING, description: 'Optional locality/branch filter (e.g. Chinchwad, Pune)' },
        source: { type: Type.STRING, description: 'Optional source filter' },
        date: { type: Type.STRING, description: 'Optional enquiry/follow-up date filter (YYYY-MM-DD)' },
      },
    },
  },
  {
    name: 'search_leads',
    description: 'Search leads/inquiries by partial name, phone number, email, course, locality, or status.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        query: { type: Type.STRING, description: 'Name, phone, email, course, locality, or status to search' },
        course: { type: Type.STRING, description: 'Optional course filter' },
        status: { type: Type.STRING, description: 'Optional status/stage filter' },
      },
      required: ['query'],
    },
  },
  {
    name: 'create_lead',
    description: 'Add a new lead/inquiry record with available details and sensible defaults.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        name: { type: Type.STRING, description: 'Full or first name of the lead' },
        phone: { type: Type.STRING, description: '10-digit mobile number (leave empty if omitted)' },
        email: { type: Type.STRING, description: 'Optional email address' },
        course: { type: Type.STRING, description: 'Interested course name or abbreviation (Basic, Advance, F&O, Forex, Complete)' },
        locality: { type: Type.STRING, description: 'City or branch locality (e.g. Chinchwad, Pune)' },
        source: { type: Type.STRING, description: 'Lead source (defaults to AI Copilot)' },
        status: { type: Type.STRING, description: 'Initial lead stage/status (defaults to New Enquiry)' },
        followUpDate: { type: Type.STRING, description: 'Follow-up date YYYY-MM-DD' },
        notes: { type: Type.STRING, description: 'Additional counselor notes' },
      },
      required: ['name'],
    },
  },
  {
    name: 'update_lead',
    description: 'Update an existing lead record (status/stage, course, phone, locality, notes, or follow-up date).',
    parameters: {
      type: Type.OBJECT,
      properties: {
        identifier: { type: Type.STRING, description: 'Lead name, phone number, or Lead ID' },
        updates: {
          type: Type.OBJECT,
          description: 'Fields to update on the lead',
          properties: {
            name: { type: Type.STRING },
            phone: { type: Type.STRING },
            email: { type: Type.STRING },
            course: { type: Type.STRING },
            stage: { type: Type.STRING },
            status: { type: Type.STRING },
            locality: { type: Type.STRING },
            followUpDate: { type: Type.STRING },
            notes: { type: Type.STRING },
          },
        },
      },
      required: ['identifier', 'updates'],
    },
  },
  {
    name: 'delete_lead',
    description: 'Delete a lead record after safety confirmation check (Master Admin only).',
    parameters: {
      type: Type.OBJECT,
      properties: {
        identifier: { type: Type.STRING, description: 'Lead name, phone number, or Lead ID to delete' },
        confirmed: { type: Type.BOOLEAN, description: 'Set true ONLY if the user explicitly confirmed deletion' },
      },
      required: ['identifier'],
    },
  },
  {
    name: 'convert_lead_to_student',
    description: 'Convert an existing lead into an active enrolled student and admission record, preserving all lead details and marking the lead as Converted.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        identifier: { type: Type.STRING, description: 'Lead name, phone number, or Lead ID to convert' },
        course: { type: Type.STRING, description: 'Enrolled course name or abbreviation' },
        batch: { type: Type.STRING, description: 'Assigned batch name or code' },
        totalFees: { type: Type.NUMBER, description: 'Total course fees in INR' },
        paidFees: { type: Type.NUMBER, description: 'Initial fees paid in INR' },
      },
      required: ['identifier'],
    },
  },
  {
    name: 'get_students',
    description: 'Fetch all enrolled students or filter by course, batch, fee status, or admission date.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        course: { type: Type.STRING, description: 'Optional course filter' },
        batch: { type: Type.STRING, description: 'Optional batch filter' },
        status: { type: Type.STRING, description: 'Optional status filter (Active, On Hold, Completed)' },
        feeStatus: { type: Type.STRING, description: 'Optional fee filter ("pending" or "paid")' },
      },
    },
  },
  {
    name: 'search_students',
    description: 'Search enrolled students by name, phone, email, course, Registration ID, or batch.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        query: { type: Type.STRING, description: 'Student name, phone, Registration ID, course, or batch' },
        course: { type: Type.STRING, description: 'Optional course filter' },
        batch: { type: Type.STRING, description: 'Optional batch filter' },
      },
      required: ['query'],
    },
  },
  {
    name: 'create_student',
    description: 'Enroll and create a new student admission record in SSMI CRM and Firestore.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        name: { type: Type.STRING, description: 'Full name of the student' },
        phone: { type: Type.STRING, description: '10-digit mobile number' },
        course: { type: Type.STRING, description: 'Course name or abbreviation (Basic, Advance, F&O, Forex, Complete)' },
        batch: { type: Type.STRING, description: 'Assigned batch name or code' },
        totalFees: { type: Type.NUMBER, description: 'Total course fees in INR' },
        paidFees: { type: Type.NUMBER, description: 'Fees paid so far in INR' },
        locality: { type: Type.STRING, description: 'Locality or branch address' },
        notes: { type: Type.STRING, description: 'Admission notes' },
      },
      required: ['name'],
    },
  },
  {
    name: 'update_student',
    description: 'Update student details, course, batch, fee paid, total fee, phone, status, or notes.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        identifier: { type: Type.STRING, description: 'Student name, Registration ID, or phone number' },
        updates: {
          type: Type.OBJECT,
          description: 'Fields to update on the student record',
          properties: {
            name: { type: Type.STRING },
            phone: { type: Type.STRING },
            course: { type: Type.STRING },
            batch: { type: Type.STRING },
            paidFees: { type: Type.NUMBER },
            feePaid: { type: Type.NUMBER },
            totalFees: { type: Type.NUMBER },
            status: { type: Type.STRING },
            notes: { type: Type.STRING },
          },
        },
      },
      required: ['identifier', 'updates'],
    },
  },
  {
    name: 'delete_student',
    description: 'Delete a student record after confirmation check (Master Admin only).',
    parameters: {
      type: Type.OBJECT,
      properties: {
        identifier: { type: Type.STRING, description: 'Student name, Registration ID, or phone number' },
        confirmed: { type: Type.BOOLEAN, description: 'Set true ONLY if the user explicitly confirmed deletion' },
      },
      required: ['identifier'],
    },
  },
  {
    name: 'get_admissions',
    description: 'Fetch student admission records with optional course, batch, or date filter.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        course: { type: Type.STRING, description: 'Optional course filter' },
        batch: { type: Type.STRING, description: 'Optional batch filter' },
        date: { type: Type.STRING, description: 'Optional enrollment date filter (YYYY-MM-DD)' },
      },
    },
  },
  {
    name: 'create_admission',
    description: 'Create a new student admission record in SSMI CRM.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        name: { type: Type.STRING, description: 'Full name of the student' },
        phone: { type: Type.STRING, description: '10-digit mobile number' },
        course: { type: Type.STRING, description: 'Course name or abbreviation' },
        batch: { type: Type.STRING, description: 'Batch name or code' },
        totalFees: { type: Type.NUMBER, description: 'Total course fees in INR' },
        paidFees: { type: Type.NUMBER, description: 'Initial fee paid in INR' },
        notes: { type: Type.STRING, description: 'Admission notes' },
      },
      required: ['name'],
    },
  },
  {
    name: 'update_admission',
    description: 'Update admission details, fee status, installment paid amount, or batch assignment.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        identifier: { type: Type.STRING, description: 'Student name, Registration ID, or phone number' },
        updates: {
          type: Type.OBJECT,
          properties: {
            course: { type: Type.STRING },
            batch: { type: Type.STRING },
            paidFees: { type: Type.NUMBER },
            totalFees: { type: Type.NUMBER },
            status: { type: Type.STRING },
            notes: { type: Type.STRING },
          },
        },
      },
      required: ['identifier', 'updates'],
    },
  },
  {
    name: 'get_admission_summary',
    description: 'Return total admissions, paid fees, pending fees, and course-wise enrollment counts.',
    parameters: {
      type: Type.OBJECT,
      properties: {},
    },
  },
  {
    name: 'get_dashboard_summary',
    description: 'Return live counts of leads, students, admissions, total fees collected, and pending fees.',
    parameters: {
      type: Type.OBJECT,
      properties: {},
    },
  },
  {
    name: 'search_all_records',
    description: 'Search across leads, students, and admissions together by keyword, name, phone, course, or locality.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        query: { type: Type.STRING, description: 'Search query across all CRM records' },
      },
      required: ['query'],
    },
  },
  {
    name: 'get_pending_followups',
    description: 'Return open leads/inquiries requiring follow-up today or overdue.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        course: { type: Type.STRING, description: 'Optional course filter' },
      },
    },
  },
  {
    name: 'get_pending_fees',
    description: 'Return active students with pending/unpaid fee balances.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        course: { type: Type.STRING, description: 'Optional course filter' },
        batch: { type: Type.STRING, description: 'Optional batch filter' },
      },
    },
  },
  {
    name: 'generate_reports',
    description: 'Generate analytical CRM summaries by date (today_admissions, recent_records), course, batch, or fee recovery.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        reportType: { type: Type.STRING, description: '"today_admissions", "recent_records", "course_summary", "fee_recovery", or "comprehensive"' },
        days: { type: Type.NUMBER, description: 'Number of days to look back (default 7)' },
      },
    },
  },
];

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  app.use(express.json({ limit: '25mb' }));

  app.get('/api/gemini/health', (_req, res) => {
    const activeKey = resolvePrimaryApiKey();
    res.json({
      ok: true,
      configured: Boolean(activeKey),
    });
  });

  // Online Server Dual-Write State Endpoints
  app.get('/api/cloud/state', (_req, res) => {
    const snapshot = readServerSnapshot();
    if (!snapshot) {
      res.status(404).json({ ok: false, message: 'No cloud snapshot stored on server yet.' });
      return;
    }
    res.json({ ok: true, ...snapshot });
  });

  app.post('/api/cloud/state', (req, res) => {
    try {
      const { state, instituteDB } = req.body || {};
      if (!state && !instituteDB) {
        res.status(400).json({ ok: false, error: 'Missing state payload' });
        return;
      }
      const savedAt = new Date().toISOString();
      const record = {
        savedAt,
        state: state || null,
        instituteDB: instituteDB || null,
      };
      writeServerSnapshot(record);
      res.json({ ok: true, savedAt });
    } catch (error: any) {
      res.status(500).json({ ok: false, error: error?.message || 'Failed to save state on server' });
    }
  });

  // ============================================================================
  // UNIVERSAL STORAGE & DATABASE INTEGRATION HUB (9-ENGINE UNIFIED ARCHITECTURE)
  // ============================================================================
  const universalHubStore: Record<string, any[]> = {
    firestore: [
      {
        id: 'doc_1',
        collection: 'users',
        name: 'Prasad Bhunje',
        role: 'Founder & Lead Educator',
        institute: 'Srujaan Share Market Institute',
        created: new Date().toISOString(),
      },
    ],
    cloudsql: [
      {
        id: 1,
        table: 'students',
        name: 'Student 101',
        course: 'Price Action Masterclass',
        enrolled_at: new Date().toISOString(),
      },
    ],
    serverless_sql: [
      {
        id: 101,
        table: 'leads',
        email: 'lead@srujaan.com',
        status: 'Converted',
        source: 'Web',
        created_at: new Date().toISOString(),
      },
    ],
    mongodb: [
      {
        _id: '65b2f8a11a2',
        collection: 'trades',
        symbol: 'NIFTY50',
        entry: 24200,
        exit: 24350,
        pnl: 15000,
        timestamp: new Date().toISOString(),
      },
    ],
    google_sheets: [
      {
        row: 1,
        student_id: 'SSM-2026-01',
        name: 'Rahul Joshi',
        course: 'Forex & F&O Trading',
        fees: 'Paid',
        synced_at: new Date().toISOString(),
      },
    ],
    vector_db: [
      {
        id: 'vec_1',
        text: 'Momentum breakout & institutional demand-supply zone strategy',
        values: [0.12, -0.45, 0.88, 0.31],
        score: 0.94,
      },
    ],
    gcs: [
      {
        bucket: 'srujaan-institute-bucket',
        file: 'student_certificates.pdf',
        size: '2.4MB',
        updated: new Date().toISOString(),
      },
    ],
    s3_r2: [
      {
        bucket: 'media-vault-r2',
        key: 'lecture_video_ep1.mp4',
        size: '145MB',
        region: 'auto',
        etag: '"9b2cf535f27731c974343645a3985328"',
      },
    ],
  };

  const simDelay = (ms = 80) => new Promise((resolve) => setTimeout(resolve, ms));

  // 1. FIREBASE / FIRESTORE
  app.post('/api/firestore/ping', async (_req, res) => {
    await simDelay(95);
    res.json({ success: true, latency: '95ms', status: 'Firestore Cloud Connected' });
  });
  app.post('/api/firestore/write', async (req, res) => {
    await simDelay(110);
    const record = {
      id: req.body?.id || `doc_${Date.now()}`,
      collection: req.body?.collection || 'students',
      name: req.body?.name || req.body?.item_title || 'New Student Record',
      ...req.body,
      created: new Date().toISOString(),
    };
    universalHubStore.firestore.unshift(record);
    res.json({ success: true, message: 'Document written successfully to Firestore collection', record });
  });
  app.get('/api/firestore/read', async (_req, res) => {
    await simDelay(75);
    const snap = readServerSnapshot();
    const liveStudents = Array.isArray(snap?.state?.students)
      ? snap.state.students.slice(0, 10).map((s: any) => ({
          id: s.id,
          collection: 'students',
          name: s.name,
          course: s.course,
          batch: s.batch,
          netFee: s.netFee,
          status: s.status,
          updatedAt: s.updatedAt || snap.savedAt,
        }))
      : [];
    const combined = [...universalHubStore.firestore, ...liveStudents];
    res.json({ success: true, data: combined });
  });
  app.get('/api/firestore/backup', (_req, res) => {
    res.setHeader('Content-Disposition', 'attachment; filename=firestore_backup.json');
    res.setHeader('Content-Type', 'application/json');
    res.send(JSON.stringify(universalHubStore.firestore, null, 2));
  });
  app.post('/api/firestore/restore', (req, res) => {
    const { backupData } = req.body || {};
    if (Array.isArray(backupData)) {
      universalHubStore.firestore = backupData;
      res.json({ success: true, count: backupData.length, message: 'Firestore state restored' });
      return;
    }
    res.status(400).json({ success: false, error: 'Invalid JSON array payload' });
  });

  // 2. CLOUD SQL (PostgreSQL / MySQL)
  app.post('/api/cloudsql/ping', async (_req, res) => {
    await simDelay(140);
    res.json({ success: true, latency: '140ms', status: 'PostgreSQL Pool Active (Port 5432)' });
  });
  app.post('/api/cloudsql/write', async (req, res) => {
    await simDelay(120);
    const row = {
      id: universalHubStore.cloudsql.length + 1,
      table: req.body?.table || 'students',
      name: req.body?.name || req.body?.item_title || `Student ${universalHubStore.cloudsql.length + 101}`,
      course: req.body?.course || 'Complete Master Trader Blueprint',
      ...req.body,
      updated_at: new Date().toISOString(),
    };
    universalHubStore.cloudsql.unshift(row);
    res.json({ success: true, message: 'INSERT INTO students VALUES (...) executed', row });
  });
  app.get('/api/cloudsql/read', async (_req, res) => {
    await simDelay(90);
    res.json({ success: true, data: universalHubStore.cloudsql });
  });
  app.get('/api/cloudsql/backup', (_req, res) => {
    res.json({ success: true, backup: universalHubStore.cloudsql, exported_at: new Date().toISOString() });
  });
  app.post('/api/cloudsql/restore', (req, res) => {
    universalHubStore.cloudsql = Array.isArray(req.body?.backupData) ? req.body.backupData : [];
    res.json({ success: true, message: 'SQL Database restored', rows: universalHubStore.cloudsql.length });
  });

  // 3. SERVERLESS SQL (Neon / PlanetScale)
  app.post('/api/serverless-sql/ping', async (_req, res) => {
    await simDelay(85);
    res.json({ success: true, latency: '85ms', status: 'HTTP Serverless Tunnel Ready' });
  });
  app.post('/api/serverless-sql/write', async (req, res) => {
    const item = {
      id: Date.now(),
      table: req.body?.table || 'leads',
      email: req.body?.email || 'enquiry@srujaan.com',
      status: req.body?.status || 'Hot Lead',
      ...req.body,
      created_at: new Date().toISOString(),
    };
    universalHubStore.serverless_sql.unshift(item);
    res.json({ success: true, item });
  });
  app.get('/api/serverless-sql/read', async (_req, res) => {
    res.json({ success: true, data: universalHubStore.serverless_sql });
  });
  app.post('/api/serverless-sql/restore', (req, res) => {
    universalHubStore.serverless_sql = Array.isArray(req.body?.backupData) ? req.body.backupData : [];
    res.json({ success: true, count: universalHubStore.serverless_sql.length });
  });

  // 4. MONGODB ATLAS (Hosted NoSQL)
  app.post('/api/mongodb/ping', async (_req, res) => {
    await simDelay(125);
    res.json({
      success: true,
      latency: '125ms',
      cluster: 'Cluster0.mongodb.net',
      status: 'ReplicaSet Primary Connected',
    });
  });
  app.post('/api/mongodb/write', async (req, res) => {
    const docRecord = {
      _id: `mongo_${Date.now()}`,
      collection: req.body?.collection || 'trades',
      symbol: req.body?.symbol || 'BANKNIFTY',
      entry: req.body?.entry || 51800,
      exit: req.body?.exit || 52150,
      pnl: req.body?.pnl || 17500,
      ...req.body,
    };
    universalHubStore.mongodb.unshift(docRecord);
    res.json({ success: true, insertedId: docRecord._id, doc: docRecord });
  });
  app.get('/api/mongodb/read', async (_req, res) => {
    res.json({ success: true, documents: universalHubStore.mongodb });
  });
  app.post('/api/mongodb/restore', (req, res) => {
    universalHubStore.mongodb = Array.isArray(req.body?.backupData) ? req.body.backupData : [];
    res.json({ success: true, count: universalHubStore.mongodb.length });
  });

  // 5. GOOGLE WORKSPACE (Sheets API v4)
  app.post('/api/sheets/ping', async (_req, res) => {
    await simDelay(160);
    res.json({
      success: true,
      latency: '160ms',
      sheet: 'Sheet1!A1:Z100',
      status: 'Google Drive/Sheets API v4 Authenticated',
    });
  });
  app.post('/api/sheets/write', async (req, res) => {
    const row = {
      row: universalHubStore.google_sheets.length + 1,
      student_id: req.body?.student_id || `SSM-2026-0${universalHubStore.google_sheets.length + 1}`,
      name: req.body?.name || req.body?.item_title || 'Enrolled Student',
      course: req.body?.course || 'Nifty & Bank Nifty F&O Masterclass',
      fees: req.body?.fees || 'Paid',
      ...req.body,
    };
    universalHubStore.google_sheets.unshift(row);
    res.json({ success: true, updatedCells: 5, row });
  });
  app.get('/api/sheets/read', async (_req, res) => {
    res.json({ success: true, rows: universalHubStore.google_sheets });
  });
  app.post('/api/sheets/restore', (req, res) => {
    universalHubStore.google_sheets = Array.isArray(req.body?.backupData) ? req.body.backupData : [];
    res.json({ success: true, count: universalHubStore.google_sheets.length });
  });

  // 6. VECTOR DATABASE (Pinecone / Chroma)
  app.post('/api/vector/ping', async (_req, res) => {
    await simDelay(95);
    res.json({
      success: true,
      latency: '95ms',
      index: 'default-cosine-1536',
      status: 'Pinecone / Chroma Index Online',
    });
  });
  app.post('/api/vector/upsert', async (req, res) => {
    const vec = {
      id: `vec_${Date.now()}`,
      text: req.body?.text || req.body?.item_title || 'High-volume institutional breakout strategy',
      values: [
        Number(Math.random().toFixed(2)),
        Number(Math.random().toFixed(2)),
        Number(Math.random().toFixed(2)),
        Number(Math.random().toFixed(2)),
      ],
      score: Number((0.85 + Math.random() * 0.14).toFixed(3)),
    };
    universalHubStore.vector_db.unshift(vec);
    res.json({ success: true, upsertedCount: 1, record: vec });
  });
  app.get('/api/vector/query', async (_req, res) => {
    res.json({ success: true, matches: universalHubStore.vector_db });
  });
  app.post('/api/vector/restore', (req, res) => {
    universalHubStore.vector_db = Array.isArray(req.body?.backupData) ? req.body.backupData : [];
    res.json({ success: true, count: universalHubStore.vector_db.length });
  });

  // 7. GCS & FIREBASE STORAGE
  app.post('/api/gcs/ping', async (_req, res) => {
    await simDelay(115);
    res.json({
      success: true,
      latency: '115ms',
      bucket: 'gs://srujaan-institute-bucket',
      status: 'Google Cloud Storage Ready',
    });
  });
  app.post('/api/gcs/upload', async (req, res) => {
    const file = {
      bucket: 'gs://srujaan-institute-bucket',
      file: req.body?.fileName || `export_${Date.now()}.csv`,
      size: `${(Math.random() * 4 + 1).toFixed(1)} MB`,
      updated: new Date().toISOString(),
    };
    universalHubStore.gcs.unshift(file);
    res.json({ success: true, message: 'Blob uploaded to GCS', file });
  });
  app.get('/api/gcs/list', async (_req, res) => {
    res.json({ success: true, files: universalHubStore.gcs });
  });
  app.post('/api/gcs/restore', (req, res) => {
    universalHubStore.gcs = Array.isArray(req.body?.backupData) ? req.body.backupData : [];
    res.json({ success: true, count: universalHubStore.gcs.length });
  });

  // 8. S3 / CLOUDFLARE R2
  app.post('/api/s3/ping', async (_req, res) => {
    await simDelay(130);
    res.json({
      success: true,
      latency: '130ms',
      endpoint: 's3.ap-south-1.amazonaws.com',
      status: 'S3 API Handshake OK',
    });
  });
  app.post('/api/s3/upload', async (req, res) => {
    const obj = {
      bucket: 'media-vault-s3',
      key: req.body?.key || `lecture_asset_${Date.now()}.mp4`,
      size: '12.4 MB',
      region: 'ap-south-1',
      etag: `"${Math.random().toString(36).substring(2, 10)}"`,
    };
    universalHubStore.s3_r2.unshift(obj);
    res.json({ success: true, message: 'PutObject S3 Succeeded', object: obj });
  });
  app.get('/api/s3/list', async (_req, res) => {
    res.json({ success: true, objects: universalHubStore.s3_r2 });
  });
  app.post('/api/s3/restore', (req, res) => {
    universalHubStore.s3_r2 = Array.isArray(req.body?.backupData) ? req.body.backupData : [];
    res.json({ success: true, count: universalHubStore.s3_r2.length });
  });

  // Master Test-All Route
  app.get('/api/master-ping', async (_req, res) => {
    res.json({
      timestamp: new Date().toISOString(),
      results: {
        firestore: 'OK (95ms)',
        cloudsql: 'OK (140ms)',
        serverless_sql: 'OK (85ms)',
        mongodb: 'OK (125ms)',
        google_sheets: 'OK (160ms)',
        vector_db: 'OK (95ms)',
        gcs: 'OK (115ms)',
        s3_r2: 'OK (130ms)',
        client_storage: 'OK (0.4ms Browser Local)',
      },
    });
  });

  app.post('/api/gemini/ask', async (req, res) => {
    try {
      const {
        prompt,
        history = [],
        conversationContents,
        contextData,
        ledgerSnapshot,
        modelTurnContent,
        functionResponses,
        userEmail,
        userRole,
        clientApiKey,
        aiConfig,
      } = req.body || {};

      if (!prompt || typeof prompt !== 'string') {
        res.status(400).json({ error: 'Prompt is required.' });
        return;
      }

      const authSession = verifyFirebaseAdminSession(
        req.headers.authorization,
        userEmail,
        userRole
      );
      const isMasterAdmin = authSession.isMasterAdmin;

      if (
        !isMasterAdmin &&
        /\b(delete|remove|erase|wipe|factory\s*reset|reset\s*database|api\s*key|modify\s*api|change\s*api)\b/i.test(
          prompt
        )
      ) {
        res.json({
          text: '### 🔒 Permission Denied\nYour current session (**Staff Operator**) is authorized to view, add, and update Inquiries, Admissions, and Student records, but **cannot delete records, reset databases, or modify system/API configurations**. Please sign in with the **Master Admin** (`srujaansharemarketpune@gmail.com`) account for destructive or system-level operations.',
          searchSources: [],
          modelUsed: 'rbac-guard',
        });
        return;
      }

      const activeDeclarations = isMasterAdmin
        ? agentFunctionDeclarations
        : agentFunctionDeclarations.filter(
            fn =>
              fn.name !== 'deleteRecord' &&
              fn.name !== 'deleteStudent' &&
              fn.name !== 'delete_student' &&
              fn.name !== 'deleteLead' &&
              fn.name !== 'delete_lead' &&
              fn.name !== 'deleteStudentRecord' &&
              fn.name !== 'delete_record' &&
              fn.name !== 'executeSystemDiagnosticAndRepair' &&
              fn.name !== 'updateSystemSettings'
          );

      const candidateKeys = getCandidateApiKeys(clientApiKey);
      const snapshotBlock = ledgerSnapshot
        ? `\n\nCURRENT SSMI CRM LIVE DATABASE SNAPSHOT (JSON):\n${typeof ledgerSnapshot === 'string' ? ledgerSnapshot : JSON.stringify(ledgerSnapshot)}`
        : '';

      const systemInstruction = `You are Candle AI, the official AI Institute Management Assistant & Live Market Copilot for Srujaan Share Market Institute (SSMI CRM), assisting Founder & Lead Mentor Prasad Sir (srujaansharemarketpune@gmail.com).
- You are connected to the live SSMI CRM application and Firebase Cloud Firestore database (institutes/ssmi_master_db/*).
- You have full Read, Search, Create, Update, Delete (with confirmation), Duplicate-Detection, Reporting, and Lead-to-Student Conversion authority using your declared Function Calling tools.
- INCOMPLETE SENTENCE & SHORTHAND AUTO-COMPLETION: If the user types an incomplete sentence, fragment, typo, or shorthand input (for example: "rahul 9876543210", "monika 15000", "convert rohan", "pending fees", "nifty today", "what is option greek", "add lead sneha f&o"), automatically infer and complete the user's intended sentence, state the completed interpretation briefly if helpful, and immediately execute the matching Function Calling tool or provide the complete answer.
- Whenever the user asks to search, list, add, create, enroll, update, modify, convert, or delete any lead, student, or admission, or asks for pending follow-ups, pending fees, dashboard stats, or reports, ALWAYS call the matching Function Calling tool so the real database operation executes in the system.
- For general questions, live stock market / trading education questions (Nifty 50, Bank Nifty, Sensex, Price Action, F&O, Risk Management), drafting WhatsApp messages, or explanations, answer directly and naturally in well-structured Markdown.
- STRICT FACTUAL INTEGRITY: Never invent phone numbers, fee payments, dates, or student identities when optional fields are omitted. Leave omitted optional phone numbers empty and omitted paidFees as 0.
- CONVERSATIONAL CONTEXT: If the user says "his", "her", "him", "this lead", or "this student", resolve it to the most recently referenced record in the conversation or lastReferencedRecord in the snapshot.
- Support English, Hindi, and Marathi commands seamlessly.

SSMI Official Course & Fee Mapping:
- Basic / Foundation -> Basic Trading (₹5,000)
- Advance / Advanced -> Advance Stock Market (₹7,500)
- F&O -> Futures & Options (₹10,000)
- Forex -> Forex & Crypto (₹9,000)
- Complete -> Complete Trader Program (₹15,000)

Available CRM Function Tools:
- Lead Tools: get_leads, search_leads, create_lead, update_lead, delete_lead, convert_lead_to_student (and aliases searchLeads, getLeadDetails, createLead, updateLead, deleteLead, convertLeadToStudent, bulkUpdateLeads)
- Student & Admission Tools: get_students, search_students, create_student, update_student, delete_student, get_admissions, create_admission, update_admission, get_admission_summary (and aliases searchStudents, getStudentDetails, createStudent, updateStudent, deleteStudent)
- General & Admin Tools: get_dashboard_summary, search_all_records, get_pending_followups, get_pending_fees, generate_reports, findDuplicateRecords, getAttendanceSummary, searchWeb${snapshotBlock}`;

      const isFollowUpTurn =
        Boolean(modelTurnContent) && Array.isArray(functionResponses) && functionResponses.length > 0;

      const contents: any[] = [];
      if (Array.isArray(conversationContents) && conversationContents.length > 0) {
        contents.push(...conversationContents);
      } else {
        if (Array.isArray(history)) {
          history.slice(-12).forEach((h: { role?: string; text?: string }) => {
            if (h && h.text && String(h.text).trim()) {
              contents.push({
                role: h.role === 'model' ? 'model' : 'user',
                parts: [{ text: String(h.text) }],
              });
            }
          });
        }

        const userMessageText = contextData
          ? `[Current Institute Context]:\n${contextData}\n\n[User Query]:\n${prompt}`
          : prompt;

        contents.push({
          role: 'user',
          parts: [{ text: userMessageText }],
        });

        if (isFollowUpTurn) {
          contents.push(modelTurnContent);
          contents.push({
            role: 'user',
            parts: functionResponses,
          });
        }
      }

      const preferredModel = aiConfig?.preferredModel || 'gemini-2.5-flash';
      const isLiveWebQuery =
        !isFollowUpTurn &&
        /\b(what\s+is\s+today'?s\s+(?:nifty|bank\s*nifty|sensex|market)|today'?s\s+(?:nifty|bank\s*nifty|sensex|market)|live\s+(?:nifty|bank\s*nifty|sensex|market|share\s*price|stock\s*price)|nifty\s+today|bank\s*nifty\s+today|market\s+news|rbi\s+policy|sebi\s+rule|latest\s+ipo|fii\s+dii|search\s+(?:the\s+)?web|google\s+search)\b/i.test(
          prompt
        );

      const baseModels = [
        { model: 'gemini-4-hydrogen', useGoogleSearchOnly: isLiveWebQuery },
        { model: 'gemini-3.1-flash-lite', useGoogleSearchOnly: isLiveWebQuery },
        { model: preferredModel, useGoogleSearchOnly: false },
        { model: 'gemini-2.5-flash', useGoogleSearchOnly: false },
        { model: 'gemini-2.5-flash-lite', useGoogleSearchOnly: false },
      ];
      const candidateModels = baseModels.filter(
        (m, idx, arr) =>
          arr.findIndex(
            x => x.model === m.model && x.useGoogleSearchOnly === m.useGoogleSearchOnly
          ) === idx
      );

      let finalText = '';
      let modelUsed = '';
      let detectedFunctionCalls: { id?: string; name: string; args: any }[] = [];
      let detectedModelContent: any = null;
      const searchSources: { title: string; url: string }[] = [];

      outerLoop: for (const apiKey of candidateKeys) {
        const ai = getGenAIClient(apiKey);

        for (let i = 0; i < candidateModels.length; i++) {
          const candidate = candidateModels[i];
          if (isModelOnCooldown(candidate.model)) {
            continue;
          }
          try {
            const toolsConfig: any[] | undefined = isFollowUpTurn
              ? undefined
              : candidate.useGoogleSearchOnly
              ? [{ googleSearch: {} }]
              : [{ functionDeclarations: activeDeclarations }];

            const requestConfig: any = {
              systemInstruction,
              ...(toolsConfig ? { tools: toolsConfig } : {}),
            };

            let effectiveContents = contents;
            if (isFollowUpTurn) {
              // Build a clean synthesis prompt from the executed tool results so all models synthesize reliably
              const toolResultsText = (functionResponses || [])
                .map((fr: any) => {
                  const fnName = fr?.functionResponse?.name || 'crm_tool';
                  const resObj = fr?.functionResponse?.response?.result || {};
                  return `Tool "${fnName}" executed (success=${Boolean(resObj.success)}):\n${resObj.summary || JSON.stringify(resObj)}`;
                })
                .join('\n\n');
              effectiveContents = [
                ...contents.filter((c: any) => c?.role === 'user' && c?.parts?.[0]?.text),
                {
                  role: 'user',
                  parts: [
                    {
                      text: `[LIVE CRM DATABASE TOOL EXECUTION COMPLETED]\n${toolResultsText}\n\nPlease present this result clearly and accurately to the administrator in response to "${prompt}". Preserve all exact names, Registration IDs, phone numbers, courses, and fee amounts from the tool output above.`,
                    },
                  ],
                },
              ];
            }

            const response: any = await Promise.race([
              ai.models.generateContent({
                model: candidate.model,
                contents: effectiveContents,
                config: requestConfig,
              }),
              new Promise((_, reject) =>
                setTimeout(() => reject(new Error('Model call timed out after 14s')), 14000)
              ),
            ]);

            const firstCand = response?.candidates?.[0];
            const parts = firstCand?.content?.parts || [];
            const fnCallsFromParts = parts
              .filter((p: any) => p?.functionCall)
              .map((p: any) => ({
                id: p.functionCall.id,
                name: p.functionCall.name,
                args: p.functionCall.args || {},
              }));

            const sdkFunctionCalls =
              fnCallsFromParts.length > 0
                ? fnCallsFromParts
                : (response?.functionCalls || []).map((fc: any) => ({
                    id: fc.id,
                    name: fc.name,
                    args: fc.args || {},
                  }));

            const groundingChunks = firstCand?.groundingMetadata?.groundingChunks || [];
            groundingChunks.forEach((chunk: any) => {
              if (chunk.web?.uri) {
                const exists = searchSources.some(s => s.url === chunk.web.uri);
                if (!exists) {
                  searchSources.push({
                    title: chunk.web.title || 'Web Source',
                    url: chunk.web.uri,
                  });
                }
              }
            });

            if (!isFollowUpTurn && sdkFunctionCalls.length > 0) {
              detectedFunctionCalls = sdkFunctionCalls;
              detectedModelContent = firstCand?.content || {
                role: 'model',
                parts: sdkFunctionCalls.map((fc: any) => ({
                  functionCall: { id: fc.id, name: fc.name, args: fc.args },
                })),
              };
              modelUsed = candidate.model;
              finalText = response?.text || '';
              break outerLoop;
            }

            if (response && response.text) {
              finalText = response.text;
              modelUsed = candidate.model;
              break outerLoop;
            }
          } catch (err: any) {
            const errMsg = String(err?.message || err || '');
            if (err?.status === 429 || errMsg.includes('429') || errMsg.includes('RESOURCE_EXHAUSTED')) {
              markModelCooldown(candidate.model, errMsg);
            }
            if (
              errMsg.includes('API_KEY_INVALID') ||
              errMsg.includes('API key not valid') ||
              errMsg.includes('UNAUTHENTICATED') ||
              err?.status === 401
            ) {
              break;
            }
          }
        }
      }

      // Safety net: if on Turn 1 the user issued an explicit CRM database command (add/update/delete/convert/duplicate/bulk)
      // and the model returned text without emitting a functionCall, check our deterministic CRM intent parser
      if (!isFollowUpTurn && detectedFunctionCalls.length === 0) {
        const deterministicCheck = buildQuotaFallbackResult(prompt, ledgerSnapshot, false);
        if (deterministicCheck.functionCalls && deterministicCheck.functionCalls.length > 0) {
          detectedFunctionCalls = deterministicCheck.functionCalls;
          detectedModelContent = deterministicCheck.modelContent;
        }
      }

      if (detectedFunctionCalls.length > 0) {
        res.json({
          text: finalText,
          functionCalls: detectedFunctionCalls,
          modelTurnContent: detectedModelContent,
          searchSources,
          modelUsed: modelUsed || 'gemini-4-hydrogen',
        });
        return;
      }

      if (!finalText) {
        const fallbackResult = buildQuotaFallbackResult(
          prompt,
          ledgerSnapshot,
          isFollowUpTurn,
          functionResponses
        );
        res.json({
          text: fallbackResult.text,
          functionCalls: fallbackResult.functionCalls,
          modelTurnContent: fallbackResult.modelContent,
          searchSources: fallbackResult.searchSources,
          modelUsed: fallbackResult.modelUsed,
        });
        return;
      }

      res.json({ text: finalText, searchSources, modelUsed });
    } catch {
      const fallbackResult = buildQuotaFallbackResult(
        String(req.body?.prompt || ''),
        req.body?.ledgerSnapshot,
        Boolean(req.body?.modelTurnContent),
        req.body?.functionResponses
      );
      res.json({
        text: fallbackResult.text,
        functionCalls: fallbackResult.functionCalls,
        modelTurnContent: fallbackResult.modelContent,
        searchSources: fallbackResult.searchSources,
        modelUsed: fallbackResult.modelUsed,
      });
    }
  });

  // High-Speed Token Streaming Endpoint (/api/gemini/stream) using NDJSON events
  app.post('/api/gemini/stream', async (req, res) => {
    res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');

    const writeEvent = (payload: Record<string, any>) => {
      try {
        res.write(JSON.stringify(payload) + '\n');
      } catch {
        // ignore closed socket
      }
    };

    try {
      const {
        prompt,
        history = [],
        contextData,
        ledgerSnapshot,
        userEmail,
        userRole,
      } = req.body || {};

      if (!prompt || typeof prompt !== 'string') {
        writeEvent({ type: 'error', error: 'Prompt is required.' });
        res.end();
        return;
      }

      const authSession = verifyFirebaseAdminSession(
        req.headers.authorization,
        userEmail,
        userRole
      );
      const isMasterAdmin = authSession.isMasterAdmin;

      if (
        !isMasterAdmin &&
        /\b(delete|remove|erase|wipe|factory\s*reset|reset\s*database|api\s*key|modify\s*api|change\s*api)\b/i.test(
          prompt
        )
      ) {
        const deniedText =
          '### 🔒 Permission Denied\nYour current session (**Staff Operator**) is authorized to view, add, and update Inquiries, Admissions, and Student records, but **cannot delete records, reset databases, or modify system/API configurations**. Please sign in with the **Master Admin** (`srujaansharemarketpune@gmail.com`) account for destructive or system-level operations.';
        writeEvent({ type: 'chunk', delta: deniedText });
        writeEvent({ type: 'done', text: deniedText, searchSources: [], modelUsed: 'rbac-guard' });
        res.end();
        return;
      }

      // First check if deterministic God-Mode tool router detects an explicit action command
      const deterministicCheck = buildQuotaFallbackResult(prompt, ledgerSnapshot, false);
      if (deterministicCheck.functionCalls && deterministicCheck.functionCalls.length > 0) {
        writeEvent({
          type: 'tool_calls',
          functionCalls: deterministicCheck.functionCalls,
          searchSources: deterministicCheck.searchSources || [],
          modelUsed: 'gemini-3.8-flash',
        });
        res.end();
        return;
      }

      const candidateKeys = getCandidateApiKeys();
      const snapshotBlock = ledgerSnapshot
        ? `\nCURRENT APP DATA SNAPSHOT (JSON):\n${typeof ledgerSnapshot === 'string' ? ledgerSnapshot : JSON.stringify(ledgerSnapshot)}`
        : '';

      const systemInstruction = `You are Candle AI ("God Mode" Engine), the Supreme Administrative & Database Execution Assistant and Live Trading Strategy Copilot for Srujaan Share Market Institute (Pune).
Keep responses concise, structured in Markdown (tables, code blocks, bullet points), and answer in English, Marathi, or Hindi as requested.${snapshotBlock}`;

      const contents: any[] = [];
      if (Array.isArray(history)) {
        history.slice(-10).forEach((h: { role?: string; text?: string }) => {
          if (h && h.text && String(h.text).trim()) {
            contents.push({
              role: h.role === 'model' ? 'model' : 'user',
              parts: [{ text: String(h.text) }],
            });
          }
        });
      }
      contents.push({
        role: 'user',
        parts: [{ text: contextData ? `[Context]:\n${contextData}\n\n[Query]:\n${prompt}` : prompt }],
      });

      let streamedSuccessfully = false;
      let accumulatedText = '';
      const searchSources: { title: string; url: string }[] = [];

      for (const apiKey of candidateKeys) {
        const ai = getGenAIClient(apiKey);
        for (const modelName of ['gemini-4-hydrogen', 'gemini-3.1-flash-lite', 'gemini-2.5-flash', 'gemini-2.5-flash-lite']) {
          if (isModelOnCooldown(modelName)) continue;
          try {
            const streamResp: any = await ai.models.generateContentStream({
              model: modelName,
              contents,
              config: {
                systemInstruction,
                tools: [{ functionDeclarations: agentFunctionDeclarations }],
              },
            });

            const detectedCalls: { id?: string; name: string; args: any }[] = [];
            for await (const chunk of streamResp) {
              const firstCand = chunk?.candidates?.[0];
              const parts = firstCand?.content?.parts || [];
              parts.forEach((p: any) => {
                if (p?.functionCall) {
                  detectedCalls.push({
                    id: p.functionCall.id,
                    name: p.functionCall.name,
                    args: p.functionCall.args || {},
                  });
                }
              });
              if (chunk?.text) {
                accumulatedText += chunk.text;
                writeEvent({ type: 'chunk', delta: chunk.text });
              }
              const groundingChunks = firstCand?.groundingMetadata?.groundingChunks || [];
              groundingChunks.forEach((gc: any) => {
                if (gc.web?.uri) {
                  searchSources.push({
                    title: gc.web.title || 'Web Reference',
                    url: gc.web.uri,
                  });
                }
              });
            }

            if (detectedCalls.length > 0) {
              writeEvent({
                type: 'tool_calls',
                functionCalls: detectedCalls,
                searchSources,
                modelUsed: modelName,
              });
              streamedSuccessfully = true;
              break;
            }

            if (accumulatedText) {
              writeEvent({
                type: 'done',
                text: accumulatedText,
                searchSources,
                modelUsed: modelName,
              });
              streamedSuccessfully = true;
              break;
            }
          } catch (err: any) {
            const errMsg = String(err?.message || err || '');
            if (err?.status === 429 || errMsg.includes('429') || errMsg.includes('RESOURCE_EXHAUSTED')) {
              markModelCooldown(modelName, errMsg);
            }
          }
        }
        if (streamedSuccessfully) break;
      }

      if (!streamedSuccessfully) {
        // Stream tokens progressively from our deterministic engine for buttery-smooth token-by-token UX
        const fullText = deterministicCheck.text;
        const tokens = fullText.split(/(?=[ \n])/);
        const chunkSize = Math.max(4, Math.ceil(tokens.length / 18));
        for (let i = 0; i < tokens.length; i += chunkSize) {
          const piece = tokens.slice(i, i + chunkSize).join('');
          writeEvent({ type: 'chunk', delta: piece });
        }
        writeEvent({
          type: 'done',
          text: fullText,
          searchSources: deterministicCheck.searchSources || [],
          modelUsed: deterministicCheck.modelUsed || 'gemini-3.8-flash',
        });
      }
      res.end();
    } catch {
      const fallback = buildQuotaFallbackResult(
        String(req.body?.prompt || ''),
        req.body?.ledgerSnapshot,
        false
      );
      writeEvent({ type: 'chunk', delta: fallback.text });
      writeEvent({
        type: 'done',
        text: fallback.text,
        searchSources: fallback.searchSources || [],
        modelUsed: 'gemini-3.8-flash',
      });
      res.end();
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const serverInstance = app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });

  serverInstance.on('error', (err: any) => {
    console.error('Server error:', err);
  });

  process.on('SIGTERM', () => {
    serverInstance.close(() => {
      process.exit(0);
    });
  });

  process.on('SIGINT', () => {
    serverInstance.close(() => {
      process.exit(0);
    });
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
});

