/**
 * Core Domain Types for Srujaan Share Market Institute Management System
 */

export interface FeeMilestone {
  name: string;
  amount: number;
  dueDate: string;
  status: 'Paid' | 'Pending' | 'Overdue';
  paymentDate?: string;
  mode?: string;
  ref?: string;
}

export interface Student {
  id: string;
  regId: string;
  studentId?: string;
  recordType?: 'student';
  leadId?: string;
  name: string;
  phone: string;
  whatsapp: string;
  email: string;
  address: string;
  branch?: string;
  course: string;
  batch: string; // Batch code or empty if unassigned
  enrollDate: string;
  enrollmentDate?: string;
  joinDate: string;
  status: 'Active' | 'On Hold' | 'Completed' | 'Archived' | 'Dropped';
  source: string;
  grossFee: number;
  discount: number;
  netFee: number;
  totalFees?: number;
  amountPaid?: number;
  balanceDue?: number;
  docs: string;
  notes: string;
  milestones: FeeMilestone[];
  updatedAt?: string;
  archivedMetadata?: Record<string, any>;
}

export interface Batch {
  code: string;
  name: string;
  course: string;
  mode: string;
  instructor: string;
  schedule: string;
  startDate: string;
  endDate: string;
  capacity: number;
  status: 'Active' | 'Upcoming' | 'Completed' | 'Archived';
}

export interface CourseLecture {
  id: string;
  courseId: string;
  title: string;
  module: string;
  instructor: string;
  sessionType: 'Live Class' | 'Trading Lab' | 'Recorded Video';
  scheduledDateTime: string;
  durationMins: number;
  summaryOrLink: string;
  completed?: boolean;
  batchCode?: string;
}

export interface Course {
  id: string;
  name: string;
  code?: string;
  fee: number;
  duration: string;
  mode: string;
  instructor: string;
  syllabus: string;
  status?: 'Active' | 'Archived';
  lectures?: CourseLecture[];
}

export interface LectureSession {
  id: string;
  courseId?: string;
  batchCode: string;
  date: string;
  time: string;
  topic: string;
  module?: string;
  sessionType?: 'Live Class' | 'Trading Lab' | 'Recorded Video';
  durationMins?: number;
  summaryOrLink?: string;
  instructor: string;
  status: 'Scheduled' | 'Completed' | 'Rescheduled' | 'Cancelled';
}

export interface AttendanceRecord {
  status: 'Present' | 'Absent' | 'Late' | 'Excused Leave' | 'Not Marked';
  note?: string;
  markedAt?: string;
}

export interface AttendanceSession {
  sessionStatus: 'Completed' | 'Scheduled' | 'Cancelled';
  topic: string;
  records: Record<string, AttendanceRecord>;
}

export interface AttendanceHistoryItem {
  id: string;
  timestamp: string;
  studentId: string;
  studentName: string;
  batchCode: string;
  date: string;
  oldStatus: string;
  newStatus: string;
  actor: string;
  note: string;
}

export type LeadStage =
  | 'New Enquiry'
  | 'Contacted'
  | 'Interested'
  | 'Demo Scheduled'
  | 'Demo Attended'
  | 'Follow-up Required'
  | 'Admission Confirmed'
  | 'Future Follow-up'
  | 'Not Interested'
  | 'Lost';

export interface Lead {
  id: string;
  leadId?: string;
  recordType?: 'inquiry';
  isConverted?: boolean;
  convertedStudentId?: string;
  status?: string;
  name: string;
  phone: string;
  email: string;
  locality: string;
  branch?: string;
  course: string;
  stage: LeadStage;
  intent: 'Hot' | 'Warm' | 'Cold';
  enquiryDate: string;
  followUpDate: string;
  followUpTime: string;
  lastContact: string;
  source: string;
  mode: string;
  staff: string;
  objection: string;
  notes: string;
  updatedAt?: string;
}

export interface WhatsAppPreset {
  id: string;
  category: 'Lead Conversion' | 'Student Communication' | 'Institute Announcement';
  scenario: string;
  tone: 'Professional' | 'Friendly' | 'Short' | 'Persuasive-but-Honest';
  title: string;
  en: string;
  hi: string;
  mr: string;
  archived?: boolean;
}

export interface CommunicationLog {
  id: string;
  timestamp: string;
  recipientType: 'Student' | 'Lead' | 'Custom';
  recipientId: string;
  recipientName: string;
  phone: string;
  scenario: string;
  status: 'Prepared' | 'Chat Opened' | 'Marked Sent';
  message: string;
}

export interface DailyQueueItem {
  id: string;
  date: string;
  recipientType: 'Student' | 'Lead';
  recipientId: string;
  recipientName: string;
  phone: string;
  batchCode: string;
  scenario: string;
  message: string;
  status: 'Prepared' | 'Chat Opened' | 'Marked Sent';
  updatedAt: string;
}

export interface Certificate {
  id: string;
  studentId: string;
  studentName: string;
  regId: string;
  course: string;
  batchCode: string;
  issueDate: string;
  grade: string;
  issuedBy: string;
}

export interface StaffMember {
  id: string;
  name: string;
  role: string;
  phone: string;
  email: string;
  salary?: number;
  joiningDate?: string;
  batches: string;
  status: 'Active' | 'On Leave' | 'Inactive';
}

export interface StudyMaterial {
  id: string;
  title: string;
  courseId?: string;
  course: string;
  fileType?: 'PDF' | 'DOCX' | 'PPTX' | 'LINK' | 'ZIP' | 'IMAGE';
  type: string;
  fileSize?: string;
  fileName?: string;
  fileData?: string;
  uploadDate?: string;
  batchAccess?: string;
  summary: string;
}

export interface AuditLog {
  id: string;
  timestamp: string;
  category: string;
  action: string;
  recordId: string;
  actor: string;
  details: string;
}

export interface SyncQueueItem {
  id: string;
  timestamp: string;
  module: string;
  operation: string;
  summary: string;
  status: string;
}

export interface CampusBranch {
  id: string;
  name: string;
  branchName?: string;
  address: string;
  fullAddress?: string;
  landmark?: string;
  city?: string;
  district?: string;
  state?: string;
  pincode?: string;
  phone: string;
  whatsapp?: string;
  googleMapsUrl?: string;
  isPrimary: boolean;
  isDefault?: boolean;
}

export interface PrimaryAddressConfig {
  branchName: string;
  streetAddress: string;
  landmark: string;
  city: string;
  district: string;
  state: string;
  pincode: string;
  phone: string;
  whatsapp: string;
  googleMapsUrl: string;
  fullFormattedAddress: string;
}

export interface MediaDocument {
  id: string;
  title: string;
  category: 'Brochure' | 'Poster' | 'Syllabus' | 'Admission' | 'Other';
  mimeType: string;
  sizeStr: string;
  uploadDate: string;
  summary: string;
  dataUrl?: string;
}

export interface InstituteSettings {
  instituteName: string;
  shortName?: string;
  tagline: string;
  description: string;
  campusAddress: string;
  primaryAddress?: PrimaryAddressConfig;
  branches: CampusBranch[];
  customBranchesInitialized?: boolean;
  selectedBranchId?: string;
  landmark?: string;
  city?: string;
  state?: string;
  district?: string;
  pincode?: string;
  phone: string;
  whatsappSupport?: string;
  email: string;
  website: string;
  whatsappChannel: string;
  youtube: string;
  instagram: string;
  googleBusiness: string;
  googleMapsUrl?: string;
  gstin: string;
  regNumber?: string;
  upiId: string;
  currencySymbol?: string;
  receiptPrefix?: string;
  receiptStartingNumber?: number;
  receiptTerms?: string;
  bankName?: string;
  bankAccountName?: string;
  bankAccountNumber?: string;
  bankIfsc?: string;
  upiQrBase64?: string;
  certificateHeading?: string;
  certificateAuthorityText?: string;
  signatoryName: string;
  signatoryDesignation: string;
  logoBase64?: string;
  primaryLogoBase64?: string;
  certificateLogoBase64?: string;
  signatureBase64?: string;
  language: 'en' | 'hi' | 'mr';
  cloudDb: {
    provider: 'local' | 'firebase' | 'supabase';
    firebase?: {
      projectId: string;
      apiKey: string;
      appId: string;
    };
    supabase?: {
      url: string;
      anonKey: string;
    };
    lastSyncAt?: string | null;
  };
  cloudConfig?: {
    provider: 'firebase' | 'custom_rest' | 'cloud_server';
    firebaseUrl?: string;
    authToken?: string;
    autoSyncIntervalMs?: number;
    autoSaveSettings?: boolean;
  };
  googleClientId?: string;
  googleSheetId?: string;
  appsScriptWebhookUrl?: string;
  appsScriptEndpointMode?: 'default' | 'custom';
  appsScriptLibraryId?: string;
  appsScriptLibraryUrl?: string;
  lastUpdated?: string;
  googleConnected?: boolean;
}

export interface UnifiedInstituteDB {
  version: string;
  lastModified: string;
  settings: {
    instituteName: string;
    tagline: string;
    address: string;
    primaryAddress?: PrimaryAddressConfig;
    branches?: CampusBranch[];
    phone: string;
    email: string;
    website: string;
    primaryLogoBase64: string;
    certificateLogoBase64: string;
    currencySymbol: string;
    receiptPrefix: string;
    terms: string;
    cloudConfig: {
      provider: 'firebase' | 'custom_rest' | 'cloud_server';
      firebaseUrl: string;
      authToken: string;
      autoSyncIntervalMs: number;
      autoSaveSettings?: boolean;
    };
    fullSettings?: InstituteSettings;
  };
  students: Student[];
  staff: StaffMember[];
  courses: Course[];
  lectures: LectureSession[];
  studyMaterials: StudyMaterial[];
  attendance: Record<string, AttendanceSession> | any;
  feeLedger: any[];
  batches?: Batch[];
  leads?: Lead[];
  certificates?: Certificate[];
}

export interface AppState {
  schemaVersion: number;
  lastSavedAt: string;
  lastManualBackupAt: string | null;
  lastCloudSyncAt: string | null;
  activeActor: string;
  excusedLeaveExcludedFromTotal: boolean;
  settings: InstituteSettings;
  students: Student[];
  batches: Batch[];
  courses: Course[];
  lectures: LectureSession[];
  attendance: Record<string, AttendanceSession>;
  attendanceHistory: AttendanceHistoryItem[];
  leads: Lead[];
  templates: WhatsAppPreset[];
  dailyQueue: DailyQueueItem[];
  communications: CommunicationLog[];
  certificates: Certificate[];
  staff: StaffMember[];
  materials: StudyMaterial[];
  mediaLibrary: MediaDocument[];
  auditLogs: AuditLog[];
  syncQueue: SyncQueueItem[];
}

export interface StorageQuotaInfo {
  usedKb: number;
  quotaMb: number;
  usagePercent: number;
  isLowStorage: boolean;
}

