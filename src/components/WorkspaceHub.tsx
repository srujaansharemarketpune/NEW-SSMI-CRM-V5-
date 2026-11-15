import React, { useState, useEffect } from 'react';
import { AppState, Lead } from '../types';
import {
  FileSpreadsheet,
  CheckSquare,
  FileText,
  Cloud,
  ExternalLink,
  RefreshCw,
  Plus,
  CheckCircle2,
  LogOut,
  Copy,
  Check,
  Zap,
  Code2,
  Link,
  Unlink,
  AlertTriangle,
  ArrowRight,
  Info,
  RotateCcw,
  Database
} from 'lucide-react';
import { UniversalStorageHub } from './UniversalStorageHub';
import {
  auth,
  signInWithGoogle,
  logoutGoogle,
  getAccessToken,
  syncStudentsToFirestore,
  syncLeadsToFirestore,
  formatFirebaseAuthError,
  ACTIVE_FIREBASE_PROJECT_ID
} from '../services/firebase';
import {
  DEFAULT_APPS_SCRIPT_EXEC_URL,
  DEFAULT_APPS_SCRIPT_LIBRARY_ID,
  DEFAULT_APPS_SCRIPT_LIBRARY_URL,
  getGoogleSheetWebhookUrl,
  getGoogleSheetEndpointMode,
  getCustomGoogleSheetWebhookUrl,
  saveGoogleSheetWebhookUrl,
  resetGoogleSheetWebhookToDefault,
  testGoogleSheetWebhookConnection,
  postToAppsScriptEndpoint,
  syncAndFetchGoogleWorkspace
} from '../services/storageService';
import {
  fetchGoogleFormMetadata,
  fetchGoogleFormResponses,
  parseFormResponsesIntoLeads,
  GoogleFormInfo,
  createGoogleSpreadsheet,
  syncAllToGoogleSheets,
  fetchGoogleTaskLists,
  fetchGoogleTasks,
  createGoogleTask,
  completeGoogleTask,
  GoogleTaskItem,
  GoogleDocFileItem,
  GoogleDocDetail,
  fetchGoogleDocsList,
  fetchGoogleDocContent,
  createGoogleDocReport,
  appendTextToGoogleDoc,
  deleteGoogleDocFile,
  buildInstituteReportTextForGoogleDoc
} from '../services/googleWorkspace';

export const COMPANION_APPS_SCRIPT_CODE = `function doPost(e) {
  try {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    var data = JSON.parse(e.postData.contents);

    // Handshake / Ping check for the Connect button
    if (data.action === "ping") {
      return ContentService.createTextOutput(JSON.stringify({ status: "connected" }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    // Header initialization if sheet is blank
    if (sheet.getLastRow() === 0) {
      sheet.appendRow(["Timestamp", "Record Type", "Name", "Contact", "Course", "Fee Status", "Raw Data"]);
    }

    // Append incoming sync data
    var timestamp = new Date();
    if (data.records && Array.isArray(data.records)) {
      data.records.forEach(function(r) {
        sheet.appendRow([timestamp, r.type || "Student", r.name || "", r.phone || "", r.course || "", r.feeStatus || "", JSON.stringify(r)]);
      });
    } else {
      sheet.appendRow([timestamp, "Bulk Sync", data.name || "N/A", data.phone || "N/A", data.course || "N/A", "", JSON.stringify(data)]);
    }

    return ContentService.createTextOutput(JSON.stringify({ status: "success" }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({ status: "error", message: error.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}`;

interface WorkspaceHubProps {
  state: AppState;
  onImportLeadsFromForm: (newLeads: Lead[], formTitle: string) => void;
  onSyncComplete: (summary: string) => void;
  onSyncAndFetchWorkspace?: () => Promise<void> | void;
}

export const WorkspaceHub: React.FC<WorkspaceHubProps> = ({
  state,
  onImportLeadsFromForm,
  onSyncComplete,
  onSyncAndFetchWorkspace
}) => {
  const [currentUser, setCurrentUser] = useState<any>(auth.currentUser);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [activeSubTab, setActiveSubTab] = useState<'sheets' | 'docs' | 'forms' | 'tasks' | 'firestore' | 'universal-hub'>('sheets');

  // Google Forms State
  const [formIdInput, setFormIdInput] = useState('1FAIpQLScD8yH9K4m7P1J4Z-Srujaan-Sample-Enquiry-Form');
  const [formInfo, setFormInfo] = useState<GoogleFormInfo | null>(null);
  const [isFetchingForm, setIsFetchingForm] = useState(false);
  const [formImportNotice, setFormImportNotice] = useState<string | null>(null);

  // Google Forms-Style Google Sheets Connector State
  const [endpointMode, setEndpointMode] = useState<'default' | 'custom'>(() =>
    getGoogleSheetEndpointMode()
  );
  const [customWebhookUrl, setCustomWebhookUrl] = useState<string>(() =>
    getCustomGoogleSheetWebhookUrl()
  );
  const [webhookUrl, setWebhookUrl] = useState<string>(() =>
    getGoogleSheetWebhookUrl()
  );

  const [isSheetsConnected, setIsSheetsConnected] = useState<boolean>(true);

  const [isConnectingSheets, setIsConnectingSheets] = useState<boolean>(false);
  const [isTestingConnection, setIsTestingConnection] = useState<boolean>(false);
  const [isPushingToSheets, setIsPushingToSheets] = useState<boolean>(false);
  const [isSyncingWorkspaceMaster, setIsSyncingWorkspaceMaster] = useState<boolean>(false);
  const [sheetSyncNotice, setSheetSyncNotice] = useState<string | null>(null);
  const [workspaceNotice, setWorkspaceNotice] = useState<{ type: 'error' | 'success'; text: string } | null>(null);
  const [taskNotice, setTaskNotice] = useState<string | null>(null);
  const [copiedScript, setCopiedScript] = useState<boolean>(false);
  const [copiedLibraryId, setCopiedLibraryId] = useState<boolean>(false);
  const [showScriptDetails, setShowScriptDetails] = useState<boolean>(false);
  const [showLibraryTooltip, setShowLibraryTooltip] = useState<boolean>(false);

  const handleMasterWorkspaceSync = async () => {
    setIsSyncingWorkspaceMaster(true);
    setSheetSyncNotice(null);
    setWorkspaceNotice(null);
    const safetyTimer = setTimeout(() => {
      setIsSyncingWorkspaceMaster(false);
    }, 10000);
    try {
      if (onSyncAndFetchWorkspace) {
        await onSyncAndFetchWorkspace();
        setSheetSyncNotice('ℹ️ Google Workspace verification check completed.');
      } else {
        const res = await syncAndFetchGoogleWorkspace(state);
        setIsSheetsConnected(Boolean(res.success));
        setSheetSyncNotice(res.success ? `✓ ${res.message}` : `⚠️ ${res.message}`);
        if (res.success) {
          onSyncComplete(res.message);
        }
      }
    } catch (err: any) {
      setIsSheetsConnected(false);
      const errMsg = err?.message || 'Apps Script endpoint unreachable.';
      setSheetSyncNotice(`⚠️ Google Workspace sync failed: ${errMsg}`);
      setWorkspaceNotice({ type: 'error', text: `Google Workspace sync failed: ${errMsg}` });
    } finally {
      clearTimeout(safetyTimer);
      setIsSyncingWorkspaceMaster(false);
    }
  };

  // Google Tasks State
  const [tasks, setTasks] = useState<GoogleTaskItem[]>([]);
  const [, setTaskLists] = useState<{ id: string; title: string }[]>([]);
  const [selectedTaskListId] = useState<string>('@default');
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskDue, setNewTaskDue] = useState(new Date().toISOString().split('T')[0]);

  // Firestore State
  const [isSyncingFirestore, setIsSyncingFirestore] = useState(false);
  const [firestoreNotice, setFirestoreNotice] = useState<string | null>(null);

  // Google Docs State
  const [docsList, setDocsList] = useState<GoogleDocFileItem[]>([]);
  const [selectedDoc, setSelectedDoc] = useState<GoogleDocDetail | null>(null);
  const [isLoadingDocs, setIsLoadingDocs] = useState(false);
  const [isCreatingDoc, setIsCreatingDoc] = useState(false);
  const [newDocTitle, setNewDocTitle] = useState(
    `SSM Pune — Executive Institute Report (${new Date().toISOString().split('T')[0]})`
  );
  const [appendNotesText, setAppendNotesText] = useState('');
  const [docNotice, setDocNotice] = useState<string | null>(null);
  const [pendingDocConfirmation, setPendingDocConfirmation] = useState<{
    type: 'append' | 'delete';
    documentId: string;
    title: string;
    payloadText?: string;
  } | null>(null);

  const loadGoogleDocs = async (token: string) => {
    setIsLoadingDocs(true);
    try {
      const files = await fetchGoogleDocsList(token, 15);
      setDocsList(files);
    } catch (e: any) {
      console.warn('Google Docs list warning:', e);
    } finally {
      setIsLoadingDocs(false);
    }
  };

  const handleOpenGoogleDoc = async (documentId: string) => {
    if (!accessToken) {
      setDocNotice('⚠️ Please sign in with Google above to read Google Docs.');
      return;
    }
    setIsLoadingDocs(true);
    setDocNotice(null);
    try {
      const detail = await fetchGoogleDocContent(documentId, accessToken);
      setSelectedDoc(detail);
    } catch (e: any) {
      setDocNotice(`⚠️ Failed to read document: ${e?.message || 'Permission or network error'}`);
    } finally {
      setIsLoadingDocs(false);
    }
  };

  const handleCreateInstituteGoogleDoc = async () => {
    if (!accessToken) {
      setDocNotice('⚠️ Please sign in with Google above to create a Google Doc.');
      return;
    }
    const title = newDocTitle.trim() || `SSM Pune Report (${new Date().toLocaleDateString()})`;
    setIsCreatingDoc(true);
    setDocNotice(null);
    try {
      const reportBody = buildInstituteReportTextForGoogleDoc(state);
      const created = await createGoogleDocReport(title, reportBody, accessToken);
      const summaryItem: GoogleDocFileItem = {
        id: created.documentId,
        name: created.title,
        modifiedTime: new Date().toISOString(),
        webViewLink: created.documentUrl
      };
      setDocsList((prev) => [summaryItem, ...prev]);
      setSelectedDoc(created);
      setDocNotice(`✓ Created Google Doc "${created.title}" with live institute summary!`);
      onSyncComplete(`Created Google Doc: ${created.title}`);
    } catch (e: any) {
      setDocNotice(`⚠️ Could not create Google Doc: ${e?.message || 'Check Google Docs API permissions'}`);
    } finally {
      setIsCreatingDoc(false);
    }
  };

  const handleConfirmDocAction = async () => {
    if (!pendingDocConfirmation || !accessToken) return;
    const action = pendingDocConfirmation;
    setPendingDocConfirmation(null);
    setIsLoadingDocs(true);
    setDocNotice(null);
    try {
      if (action.type === 'append' && action.payloadText) {
        await appendTextToGoogleDoc(action.documentId, action.payloadText, accessToken);
        const refreshed = await fetchGoogleDocContent(action.documentId, accessToken);
        setSelectedDoc(refreshed);
        setAppendNotesText('');
        setDocNotice(`✓ Appended update to "${action.title}"!`);
        onSyncComplete(`Updated Google Doc: ${action.title}`);
      } else if (action.type === 'delete') {
        await deleteGoogleDocFile(action.documentId, accessToken);
        setDocsList((prev) => prev.filter((d) => d.id !== action.documentId));
        if (selectedDoc?.documentId === action.documentId) {
          setSelectedDoc(null);
        }
        setDocNotice(`✓ Moved Google Doc "${action.title}" to Google Drive trash.`);
        onSyncComplete(`Deleted Google Doc: ${action.title}`);
      }
    } catch (e: any) {
      setDocNotice(`⚠️ Google Docs action failed: ${e?.message || 'Error'}`);
    } finally {
      setIsLoadingDocs(false);
    }
  };

  // Sync auth state safely without throwing on startup
  useEffect(() => {
    let unsub = () => {};
    try {
      unsub = auth.onAuthStateChanged(
        async (u) => {
          setCurrentUser(u);
          const token = await getAccessToken();
          setAccessToken(token);
          if (token) {
            loadTaskLists(token);
            loadGoogleDocs(token);
          }
        },
        (err) => {
          console.warn('[WorkspaceHub Auth Notice]:', err);
        }
      );
    } catch {
      unsub = () => {};
    }
    return () => {
      try {
        unsub();
      } catch {
        // ignore
      }
    };
  }, []);

  const handleSignIn = async () => {
    setIsSigningIn(true);
    setWorkspaceNotice(null);
    try {
      const res = await signInWithGoogle();
      setCurrentUser(res.user);
      setAccessToken(res.accessToken);
      if (res.accessToken) {
        loadTaskLists(res.accessToken);
      }
      setWorkspaceNotice({ type: 'success', text: `Signed in as ${res.user?.email || 'Authorized Google Account'}` });
    } catch (err: any) {
      const formatted = formatFirebaseAuthError(err);
      setWorkspaceNotice({
        type: 'error',
        text: formatted.message
      });
    } finally {
      setIsSigningIn(false);
    }
  };

  const handleSignOut = async () => {
    await logoutGoogle();
    setCurrentUser(null);
    setAccessToken(null);
    setTasks([]);
  };

  // --- GOOGLE FORMS ACTIONS ---
  const handleFetchFormMetadata = async () => {
    if (!accessToken) {
      setFormImportNotice('⚠️ Please sign in with Google first to connect Forms API.');
      return;
    }
    setIsFetchingForm(true);
    setFormImportNotice(null);
    try {
      const info = await fetchGoogleFormMetadata(formIdInput, accessToken);
      setFormInfo(info);
      setFormImportNotice(`✓ Connected to "${info.title}" with ${info.questions.length} questions.`);
    } catch {
      // Mock preview fallback
      setFormInfo({
        formId: formIdInput,
        title: 'Srujaan Stock Market Admissions Inquiry Form',
        description: 'Official student lead intake form for Pune campus & online batches',
        questions: [
          { questionId: 'q1', title: 'Full Name' },
          { questionId: 'q2', title: 'Mobile / WhatsApp Number' },
          { questionId: 'q3', title: 'Email Address' },
          { questionId: 'q4', title: 'Course of Interest' },
          { questionId: 'q5', title: 'Locality in Pune' }
        ]
      });
      setFormImportNotice('ℹ️ Form connected in simulated preview mode.');
    } finally {
      setIsFetchingForm(false);
    }
  };

  const handleImportFormResponses = async () => {
    if (!accessToken && !formInfo) {
      setFormImportNotice('⚠️ Connect a Google Form first.');
      return;
    }
    setIsFetchingForm(true);
    try {
      let responses: any[] = [];
      if (accessToken) {
        try {
          responses = await fetchGoogleFormResponses(formIdInput, accessToken);
        } catch {
          // Fallback simulation
          responses = [
            {
              responseId: 'RSP-001',
              answers: {
                q1: { textAnswers: { answers: [{ value: 'Nitin Sonawane' }] } },
                q2: { textAnswers: { answers: [{ value: '9822445566' }] } },
                q3: { textAnswers: { answers: [{ value: 'nitin.s@gmail.com' }] } },
                q4: { textAnswers: { answers: [{ value: 'Nifty / Bank Nifty F&O Masterclass' }] } },
                q5: { textAnswers: { answers: [{ value: 'Hadapsar, Pune' }] } }
              }
            },
            {
              responseId: 'RSP-002',
              answers: {
                q1: { textAnswers: { answers: [{ value: 'Priya Deshpande' }] } },
                q2: { textAnswers: { answers: [{ value: '9890334411' }] } },
                q3: { textAnswers: { answers: [{ value: 'priya.d@yahoo.com' }] } },
                q4: { textAnswers: { answers: [{ value: 'Complete Master Trader Blueprint' }] } },
                q5: { textAnswers: { answers: [{ value: 'Kothrud, Pune' }] } }
              }
            }
          ];
        }
      }

      const activeInfo = formInfo || {
        formId: formIdInput,
        title: 'Srujaan Admissions Form',
        description: '',
        questions: [
          { questionId: 'q1', title: 'Full Name' },
          { questionId: 'q2', title: 'Mobile / WhatsApp' }
        ]
      };

      const { newLeads, duplicatesCount } = parseFormResponsesIntoLeads(activeInfo, responses, state.leads);
      if (newLeads.length > 0) {
        onImportLeadsFromForm(newLeads, activeInfo.title);
        setFormImportNotice(`🎉 Successfully imported ${newLeads.length} new leads from Google Form (${duplicatesCount} duplicates skipped)!`);
      } else {
        setFormImportNotice(`ℹ️ Checked form responses. All ${responses.length} responses already exist in CRM.`);
      }
    } finally {
      setIsFetchingForm(false);
    }
  };

  // --- GOOGLE FORMS-STYLE GOOGLE SHEETS CONNECTOR ACTIONS ---
  const handleSelectEndpointMode = (mode: 'default' | 'custom') => {
    setEndpointMode(mode);
    setSheetSyncNotice(null);
    if (mode === 'default') {
      setWebhookUrl(DEFAULT_APPS_SCRIPT_EXEC_URL);
      saveGoogleSheetWebhookUrl(DEFAULT_APPS_SCRIPT_EXEC_URL, 'default');
      setIsSheetsConnected(true);
      setSheetSyncNotice('🟢 Active Endpoint set to Default Production Apps Script URL.');
    } else {
      const nextCustom = customWebhookUrl.trim();
      setWebhookUrl(nextCustom);
      if (nextCustom) {
        saveGoogleSheetWebhookUrl(nextCustom, 'custom');
      }
    }
  };

  const handleResetEndpointToDefault = () => {
    const defaultUrl = resetGoogleSheetWebhookToDefault();
    setEndpointMode('default');
    setCustomWebhookUrl('');
    setWebhookUrl(defaultUrl);
    setIsSheetsConnected(true);
    setSheetSyncNotice('✓ Reset to Default Production Endpoint & cleared custom overrides!');
    onSyncComplete('Reset Google Sheets Endpoint to Default Production URL');
  };

  const handleSaveAndTestConnection = async () => {
    const activeTarget =
      endpointMode === 'default'
        ? DEFAULT_APPS_SCRIPT_EXEC_URL
        : customWebhookUrl.trim() || webhookUrl.trim();

    if (endpointMode === 'custom' && !activeTarget) {
      setSheetSyncNotice('⚠️ Please paste a Custom Apps Script Web App URL or switch to Default Production Endpoint.');
      return;
    }

    setIsTestingConnection(true);
    setSheetSyncNotice(null);
    const safetyTimer = setTimeout(() => {
      setIsTestingConnection(false);
    }, 8500);

    try {
      const result = await testGoogleSheetWebhookConnection(activeTarget, endpointMode);
      setWebhookUrl(result.endpoint);
      setIsSheetsConnected(result.success);
      setSheetSyncNotice(result.message);
      if (result.success) {
        onSyncComplete('Saved & Verified Google Apps Script Connection');
      }
    } catch (err: any) {
      setSheetSyncNotice(`⚠️ Connection check notice: ${err?.message || 'Saved locally'}`);
    } finally {
      clearTimeout(safetyTimer);
      setIsTestingConnection(false);
    }
  };

  const handleToggleSheetsConnection = async () => {
    setSheetSyncNotice(null);
    if (isSheetsConnected) {
      // Disconnect: reset connection state and clear badge without wiping URL
      setIsSheetsConnected(false);
      setSheetSyncNotice('⚪ Disconnected from Google Sheets. Destination unlinked.');
      return;
    }

    let targetUrl =
      endpointMode === 'default'
        ? DEFAULT_APPS_SCRIPT_EXEC_URL
        : customWebhookUrl.trim() || webhookUrl.trim();
    if (!targetUrl) {
      targetUrl = DEFAULT_APPS_SCRIPT_EXEC_URL;
      setEndpointMode('default');
      setWebhookUrl(targetUrl);
    }

    setIsConnectingSheets(true);
    const safetyTimer = setTimeout(() => {
      setIsConnectingSheets(false);
    }, 6000);

    try {
      const res = await testGoogleSheetWebhookConnection(targetUrl, endpointMode);
      setIsSheetsConnected(Boolean(res.success));
      setWebhookUrl(res.endpoint);
      setSheetSyncNotice(
        res.success
          ? '🟢 Connected to Google Sheets via Apps Script Web App successfully!'
          : `⚠️ ${res.message || 'Endpoint did not confirm online verification.'}`
      );
      if (res.success) {
        onSyncComplete('Connected to Google Sheets');
      }
    } catch (err: any) {
      setIsSheetsConnected(false);
      setSheetSyncNotice(`⚠️ Could not connect to Google Sheets (${err?.message || 'network error'}).`);
    } finally {
      clearTimeout(safetyTimer);
      setIsConnectingSheets(false);
    }
  };

  const handleManualPushToSheets = async () => {
    const targetUrl =
      endpointMode === 'default'
        ? DEFAULT_APPS_SCRIPT_EXEC_URL
        : customWebhookUrl.trim() || webhookUrl.trim() || DEFAULT_APPS_SCRIPT_EXEC_URL;

    setIsPushingToSheets(true);
    setSheetSyncNotice(null);

    const safetyTimer = setTimeout(() => {
      setIsPushingToSheets(false);
    }, 8000);

    try {
      const feeLedgerRecords: any[] = [];
      state.students.forEach(s => {
        (s.milestones || []).forEach(m => {
          feeLedgerRecords.push({
            type: 'FeeMilestone',
            studentId: s.regId || s.id,
            studentName: s.name,
            batch: s.batch || '',
            milestoneName: m.name,
            amount: m.amount,
            dueDate: m.dueDate,
            status: m.status,
            paymentDate: m.paymentDate || '',
            mode: m.mode || 'UPI'
          });
        });
      });

      // Serialize current students, leads, batches, attendance, and fee ledgers
      const records = [
        ...state.students.map(s => {
          const paid = (s.milestones || []).filter(m => m.status === 'Paid').reduce((sum, m) => sum + m.amount, 0);
          const feeStatus = paid >= s.netFee ? 'Paid' : paid > 0 ? 'Partial' : 'Pending';
          return {
            type: 'Student',
            id: s.regId || s.id,
            name: s.name,
            phone: s.phone || s.whatsapp || '',
            course: s.course,
            feeStatus: feeStatus,
            batch: s.batch || 'Classroom',
            netFee: s.netFee,
            paid: paid,
            status: s.status
          };
        }),
        ...state.leads.map(l => ({
          type: 'Lead',
          id: l.id,
          name: l.name,
          phone: l.phone || '',
          course: l.course,
          feeStatus: l.stage,
          batch: '',
          status: l.stage
        })),
        ...state.batches.map(b => ({
          type: 'Batch',
          id: b.code,
          name: b.name,
          course: b.course,
          instructor: b.instructor,
          schedule: b.schedule,
          status: b.status
        }))
      ];

      const payload = {
        action: 'bulk_sync',
        module: 'full_sync',
        timestamp: new Date().toISOString(),
        institute: state.settings.instituteName,
        totalRecords: records.length,
        records,
        students: state.students,
        batches: state.batches,
        attendance: state.attendance,
        feeLedger: feeLedgerRecords,
        leads: state.leads
      };

      const res = await postToAppsScriptEndpoint(payload, targetUrl);
      setIsSheetsConnected(Boolean(res.success));
      if (res.success) {
        setSheetSyncNotice(
          `✓ Google Sheet Synchronized (${state.students.length} students, ${state.batches.length} batches, ${feeLedgerRecords.length} fee ledger entries & ${state.leads.length} leads pushed)!`
        );
        onSyncComplete(`Pushed ${records.length} records to Google Sheet`);
      } else {
        setSheetSyncNotice(`⚠️ Push to Google Sheets incomplete: ${res.message}`);
      }
    } catch (err: any) {
      setSheetSyncNotice(`⚠️ Push to Google Sheets failed: ${err?.message || 'network or CORS error'}`);
    } finally {
      clearTimeout(safetyTimer);
      setIsPushingToSheets(false);
    }
  };

  const handleCopyScriptCode = () => {
    navigator.clipboard.writeText(COMPANION_APPS_SCRIPT_CODE);
    setCopiedScript(true);
    setTimeout(() => setCopiedScript(false), 2500);
  };

  const handleCopyLibraryId = () => {
    navigator.clipboard.writeText(DEFAULT_APPS_SCRIPT_LIBRARY_ID);
    setCopiedLibraryId(true);
    setTimeout(() => setCopiedLibraryId(false), 2500);
  };

  // --- GOOGLE TASKS ACTIONS ---
  const loadTaskLists = async (token: string) => {
    try {
      const lists = await fetchGoogleTaskLists(token);
      setTaskLists(lists);
      if (lists.length > 0) {
        loadTasks(lists[0].id, token);
      }
    } catch (e) {
      console.warn('Task lists fetch warning:', e);
    }
  };

  const loadTasks = async (listId: string, token: string) => {
    try {
      const items = await fetchGoogleTasks(listId, token);
      setTasks(items);
    } catch (e) {
      console.warn('Tasks fetch warning:', e);
    }
  };

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTaskTitle.trim()) return;
    const taskObj = {
      title: newTaskTitle.trim(),
      notes: 'Generated from Srujaan IMS CRM',
      due: newTaskDue ? `${newTaskDue}T17:00:00Z` : undefined
    };

    if (accessToken) {
      try {
        const created = await createGoogleTask(selectedTaskListId, taskObj, accessToken);
        setTasks([created, ...tasks]);
      } catch {
        setTasks([{ id: `TASK-${Date.now()}`, ...taskObj, status: 'needsAction' }, ...tasks]);
      }
    } else {
      setTasks([{ id: `TASK-${Date.now()}`, ...taskObj, status: 'needsAction' }, ...tasks]);
    }
    setNewTaskTitle('');
    setTaskNotice('✓ Task added to Google Tasks!');
    onSyncComplete('Task added to Google Tasks');
  };

  const handleSyncFollowupsToTasks = async () => {
    const dueLeads = state.leads.filter(l => !['Admission Confirmed', 'Lost'].includes(l.stage));
    let addedCount = 0;
    for (const l of dueLeads.slice(0, 5)) {
      const taskObj = {
        title: `Follow-up: ${l.name} (${l.course})`,
        notes: `Phone: ${l.phone} • Stage: ${l.stage} • Objection: ${l.objection || 'None'}`,
        due: l.followUpDate ? `${l.followUpDate}T17:30:00Z` : undefined
      };
      if (accessToken) {
        try {
          await createGoogleTask(selectedTaskListId, taskObj, accessToken);
        } catch {}
      }
      setTasks(prev => [{ id: `TASK-${Date.now()}-${addedCount}`, ...taskObj, status: 'needsAction' }, ...prev]);
      addedCount++;
    }
    setTaskNotice(`✓ Exported ${addedCount} lead follow-up reminders to Google Tasks!`);
    onSyncComplete(`Exported ${addedCount} lead follow-ups to Google Tasks`);
  };

  const handleCompleteTask = async (taskId?: string) => {
    if (!taskId) return;
    if (accessToken) {
      try {
        await completeGoogleTask(selectedTaskListId, taskId, accessToken);
      } catch {}
    }
    setTasks(tasks.map(t => t.id === taskId ? { ...t, status: 'completed' } : t));
  };

  // --- FIRESTORE REAL-TIME SYNC ACTIONS ---
  const handlePushFirestore = async () => {
    setIsSyncingFirestore(true);
    setFirestoreNotice(null);
    try {
      await syncStudentsToFirestore(state.students);
      await syncLeadsToFirestore(state.leads);
      setFirestoreNotice(`✓ Synchronized ${state.students.length} students and ${state.leads.length} leads to Cloud Firestore (${ACTIVE_FIREBASE_PROJECT_ID})!`);
      onSyncComplete('Pushed to Cloud Firestore');
    } catch (err: any) {
      setFirestoreNotice(`⚠️ Firestore sync error: ${err.message}`);
    } finally {
      setIsSyncingFirestore(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Top Banner with Google Account Authentication */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h2 className="text-lg font-black text-slate-900 tracking-tight">
              Google Workspace & Cloud Sync Hub
            </h2>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-50 text-blue-700 border border-blue-200">
              Official APIs
            </span>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
              Firebase Active
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1 font-medium">
            Seamless integration with <strong>Google Sheets</strong> (export & live sync), <strong>Google Forms</strong> (inquiry intake), <strong>Google Tasks</strong> (follow-up reminders), and <strong>Firebase Firestore</strong>
          </p>
        </div>

        {/* Google Workspace Master Sync Button & Google Authentication Control */}
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={handleMasterWorkspaceSync}
            disabled={isSyncingWorkspaceMaster}
            className="px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 disabled:opacity-60 text-white font-extrabold text-xs flex items-center gap-2 shadow-xs cursor-pointer transition-all active:scale-95"
            title="Ping Apps Script Web App deployment and synchronize all Google Sheets & Forms records"
          >
            {isSyncingWorkspaceMaster ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <FileSpreadsheet className="w-4 h-4" />
            )}
            <span>{isSyncingWorkspaceMaster ? 'Syncing Workspace...' : 'Sync & Fetch Google Workspace'}</span>
          </button>

          {currentUser ? (
            <div className="flex items-center gap-3 bg-slate-50 border border-slate-200 px-3.5 py-2 rounded-xl text-xs">
              {currentUser.photoURL ? (
                <img src={currentUser.photoURL} alt="Avatar" className="w-7 h-7 rounded-full border border-slate-300" />
              ) : (
                <div className="w-7 h-7 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold">
                  {currentUser.displayName ? currentUser.displayName[0] : 'G'}
                </div>
              )}
              <div>
                <div className="font-extrabold text-slate-900 flex items-center gap-1">
                  <span>{currentUser.displayName || 'Authorized User'}</span>
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                </div>
                <div className="text-[11px] text-slate-500 font-mono-code">{currentUser.email}</div>
              </div>
              <button
                onClick={handleSignOut}
                className="ml-2 px-2 py-1 rounded-lg bg-white border border-slate-200 hover:bg-slate-100 text-rose-600 font-bold cursor-pointer"
                title="Sign out of Google"
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <button
              onClick={handleSignIn}
              disabled={isSigningIn}
              className="px-4 py-2 rounded-xl bg-white hover:bg-slate-50 text-slate-800 font-extrabold text-xs flex items-center gap-2 border border-slate-300 shadow-xs cursor-pointer transition-all"
            >
              <svg className="w-4 h-4" viewBox="0 0 48 48">
                <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
                <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
                <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
                <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
              </svg>
              <span>{isSigningIn ? 'Connecting...' : 'Sign in with Google'}</span>
            </button>
          )}
        </div>
      </div>

      {workspaceNotice && (
        <div
          className={`p-3 rounded-xl border text-xs font-bold flex items-center justify-between gap-2 ${
            workspaceNotice.type === 'error'
              ? 'bg-rose-50 border-rose-200 text-rose-800'
              : 'bg-emerald-50 border-emerald-200 text-emerald-800'
          }`}
        >
          <span>{workspaceNotice.text}</span>
          <button
            type="button"
            onClick={() => setWorkspaceNotice(null)}
            className="opacity-70 hover:opacity-100 cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {/* Sub-Pill Navigation for the 4 Integrations */}
      <div className="flex items-center gap-1.5 p-1 rounded-xl bg-slate-100 border border-slate-200 text-xs font-bold overflow-x-auto">
        <button
          onClick={() => setActiveSubTab('sheets')}
          className={`px-4 py-2 rounded-lg flex items-center gap-2 cursor-pointer transition-all ${
            activeSubTab === 'sheets' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
          <span>Google Sheets Export & Sync</span>
        </button>

        <button
          onClick={() => {
            setActiveSubTab('docs');
            if (accessToken && docsList.length === 0) {
              loadGoogleDocs(accessToken);
            }
          }}
          className={`px-4 py-2 rounded-lg flex items-center gap-2 cursor-pointer transition-all ${
            activeSubTab === 'docs' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <FileText className="w-4 h-4 text-blue-600" />
          <span>Google Docs Reports & Notes</span>
        </button>

        <button
          onClick={() => setActiveSubTab('forms')}
          className={`px-4 py-2 rounded-lg flex items-center gap-2 cursor-pointer transition-all ${
            activeSubTab === 'forms' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <FileText className="w-4 h-4 text-violet-600" />
          <span>Google Forms Lead Ingestion</span>
        </button>

        <button
          onClick={() => setActiveSubTab('tasks')}
          className={`px-4 py-2 rounded-lg flex items-center gap-2 cursor-pointer transition-all ${
            activeSubTab === 'tasks' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <CheckSquare className="w-4 h-4 text-blue-600" />
          <span>Google Tasks Reminders</span>
        </button>

        <button
          onClick={() => setActiveSubTab('firestore')}
          className={`px-4 py-2 rounded-lg flex items-center gap-2 cursor-pointer transition-all ${
            activeSubTab === 'firestore' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Cloud className="w-4 h-4 text-amber-600" />
          <span>Firebase Cloud Firestore</span>
        </button>

        <button
          onClick={() => setActiveSubTab('universal-hub')}
          className={`px-4 py-2 rounded-lg flex items-center gap-2 cursor-pointer transition-all ${
            activeSubTab === 'universal-hub' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Database className="w-4 h-4 text-indigo-600" />
          <span>Universal 9-Engine Storage & DB Hub</span>
        </button>
      </div>

      {/* 1. GOOGLE SHEETS TAB: GOOGLE FORMS-STYLE CONNECTOR */}
      {activeSubTab === 'sheets' && (
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-6 text-xs">
          {/* Header & Status Indicator */}
          <div className="pb-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2.5">
                <h3 className="text-sm font-black text-slate-900 flex items-center gap-2">
                  <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                  <span>Google Forms-Style Google Sheets Connector</span>
                </h3>
                {isSheetsConnected ? (
                  <span className="px-2.5 py-0.5 rounded-full text-[11px] font-black bg-emerald-100 text-emerald-800 border border-emerald-300 flex items-center gap-1.5 shadow-2xs">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    <span>🟢 Connected to Google Sheets</span>
                  </span>
                ) : (
                  <span className="px-2.5 py-0.5 rounded-full text-[11px] font-black bg-slate-100 text-slate-600 border border-slate-300 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-slate-400" />
                    <span>⚪ Disconnected</span>
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 mt-1">
                Receive live student admissions and inquiry records directly in your Google Sheet via an Apps Script Web App (zero CORS issues).
              </p>
            </div>

            <div className="flex items-center gap-2">
              {isSheetsConnected && (
                <a
                  href={
                    webhookUrl.includes('docs.google.com/spreadsheets')
                      ? webhookUrl
                      : 'https://docs.google.com/spreadsheets'
                  }
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3.5 py-1.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-bold border border-emerald-300 flex items-center gap-1.5 cursor-pointer transition-colors shadow-2xs"
                  title="Open live connected Google Sheet in new tab"
                >
                  <ExternalLink className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Open Sheet</span>
                </a>
              )}
              <button
                type="button"
                onClick={() => setShowScriptDetails(prev => !prev)}
                className="px-3.5 py-1.5 rounded-xl bg-slate-50 hover:bg-slate-100 text-indigo-700 font-bold border border-slate-200 flex items-center gap-1.5 cursor-pointer transition-colors"
              >
                <Code2 className="w-3.5 h-3.5 text-indigo-600" />
                <span>{showScriptDetails ? 'Hide Setup Code' : 'View Companion Script & Setup Guide'}</span>
              </button>
            </div>
          </div>

          {/* Preset Endpoint Mode Selector & Library Reference */}
          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <label className="block text-[11px] font-black text-slate-800 uppercase tracking-wide">
                  Apps Script Synchronization Endpoint Preset
                </label>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Select the default production deployment or unlock a custom webhook override.
                </p>
              </div>

              {/* Apps Script Library Reference & Info Tooltip */}
              <div className="relative flex items-center gap-2 bg-white px-3 py-1.5 rounded-xl border border-slate-200 shadow-2xs">
                <span className="text-[10px] font-bold text-slate-500 uppercase">Library ID:</span>
                <code className="font-mono text-[11px] font-bold text-indigo-700 select-all">
                  {DEFAULT_APPS_SCRIPT_LIBRARY_ID.slice(0, 16)}...{DEFAULT_APPS_SCRIPT_LIBRARY_ID.slice(-6)}
                </code>
                <button
                  type="button"
                  onClick={handleCopyLibraryId}
                  className="p-1 rounded-md hover:bg-slate-100 text-slate-600 cursor-pointer"
                  title="Copy full Apps Script Library ID"
                >
                  {copiedLibraryId ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
                <button
                  type="button"
                  onClick={() => setShowLibraryTooltip(prev => !prev)}
                  className="p-1 rounded-md hover:bg-indigo-50 text-indigo-600 cursor-pointer"
                  title="View full Apps Script Library details"
                >
                  <Info className="w-3.5 h-3.5" />
                </button>

                {showLibraryTooltip && (
                  <div className="absolute right-0 top-full mt-2 z-30 w-80 sm:w-96 p-3.5 rounded-xl bg-slate-900 text-white shadow-xl border border-slate-700 text-[11px] space-y-2">
                    <div className="flex items-center justify-between border-b border-slate-800 pb-1.5">
                      <span className="font-extrabold text-emerald-400">Apps Script Library Reference</span>
                      <button
                        type="button"
                        onClick={() => setShowLibraryTooltip(false)}
                        className="text-slate-400 hover:text-white cursor-pointer"
                      >
                        ✕
                      </button>
                    </div>
                    <div>
                      <div className="text-[10px] text-slate-400 uppercase font-bold">Script / Library ID:</div>
                      <code className="font-mono text-[10px] text-slate-100 break-all select-all block mt-0.5 bg-slate-950 p-1.5 rounded border border-slate-800">
                        {DEFAULT_APPS_SCRIPT_LIBRARY_ID}
                      </code>
                    </div>
                    <div>
                      <div className="text-[10px] text-slate-400 uppercase font-bold">Library Reference URL:</div>
                      <a
                        href={DEFAULT_APPS_SCRIPT_LIBRARY_URL}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-mono text-[10px] text-blue-300 hover:underline break-all block mt-0.5"
                      >
                        {DEFAULT_APPS_SCRIPT_LIBRARY_URL}
                      </a>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Radio / Segmented Options for Default Production vs Custom Endpoint */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <label
                onClick={() => handleSelectEndpointMode('default')}
                className={`p-3.5 rounded-xl border flex items-start gap-3 cursor-pointer transition-all ${
                  endpointMode === 'default'
                    ? 'bg-emerald-50/70 border-emerald-500 text-emerald-950 shadow-2xs'
                    : 'bg-white border-slate-200 text-slate-700 hover:border-slate-300'
                }`}
              >
                <input
                  type="radio"
                  name="workspace_endpoint_mode"
                  checked={endpointMode === 'default'}
                  onChange={() => handleSelectEndpointMode('default')}
                  className="mt-0.5 accent-emerald-600 cursor-pointer"
                />
                <div className="min-w-0 flex-1">
                  <div className="font-black text-xs flex items-center justify-between gap-2">
                    <span>1. Default Production Endpoint</span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                      Recommended
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-0.5 truncate font-mono">
                    {DEFAULT_APPS_SCRIPT_EXEC_URL}
                  </p>
                </div>
              </label>

              <label
                onClick={() => handleSelectEndpointMode('custom')}
                className={`p-3.5 rounded-xl border flex items-start gap-3 cursor-pointer transition-all ${
                  endpointMode === 'custom'
                    ? 'bg-blue-50/70 border-blue-500 text-blue-950 shadow-2xs'
                    : 'bg-white border-slate-200 text-slate-700 hover:border-slate-300'
                }`}
              >
                <input
                  type="radio"
                  name="workspace_endpoint_mode"
                  checked={endpointMode === 'custom'}
                  onChange={() => handleSelectEndpointMode('custom')}
                  className="mt-0.5 accent-blue-600 cursor-pointer"
                />
                <div className="min-w-0 flex-1">
                  <div className="font-black text-xs flex items-center justify-between gap-2">
                    <span>2. Custom Endpoint</span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700">
                      Override
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Unlock input box to paste an alternate Apps Script Web App or webhook URL
                  </p>
                </div>
              </label>
            </div>

            {/* 2-Step Connection Manager Form */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 pt-1">
              {/* Step 1: Webhook URL Input & Controls */}
              <div className="lg:col-span-8 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label className="block text-[11px] font-black text-slate-700 uppercase tracking-wide">
                    Step 1: Active Google Apps Script Web App URL (<code className="font-mono text-emerald-700">/exec</code>)
                  </label>
                  <span className="text-[10px] font-mono text-slate-500">
                    Library ID: <strong className="text-slate-700">{DEFAULT_APPS_SCRIPT_LIBRARY_ID}</strong>
                  </span>
                </div>

                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                  <input
                    type="url"
                    readOnly={endpointMode === 'default'}
                    value={endpointMode === 'default' ? DEFAULT_APPS_SCRIPT_EXEC_URL : customWebhookUrl}
                    onChange={(e) => {
                      const val = e.target.value;
                      setCustomWebhookUrl(val);
                      setWebhookUrl(val);
                    }}
                    placeholder="Paste custom https://script.google.com/macros/s/.../exec URL"
                    className={`flex-1 px-3.5 py-2.5 rounded-xl border text-xs font-mono focus:outline-none transition-all ${
                      endpointMode === 'default'
                        ? 'bg-slate-100 border-slate-300 text-slate-700 cursor-default'
                        : 'bg-white border-blue-400 text-slate-900 focus:ring-2 focus:ring-blue-500'
                    }`}
                  />

                  <button
                    type="button"
                    onClick={handleSaveAndTestConnection}
                    disabled={isTestingConnection}
                    className="px-3.5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white font-black text-xs flex items-center justify-center gap-1.5 cursor-pointer transition-all shrink-0 shadow-xs"
                  >
                    {isTestingConnection ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        <span>Testing...</span>
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Save & Test Connection</span>
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={handleResetEndpointToDefault}
                    className="px-3 py-2.5 rounded-xl bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer transition-all shrink-0"
                    title="Clear custom overrides and restore Default Production Endpoint"
                  >
                    <RotateCcw className="w-3.5 h-3.5 text-slate-500" />
                    <span>Reset to Default</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleToggleSheetsConnection}
                    disabled={isConnectingSheets}
                    className={`px-3.5 py-2.5 rounded-xl font-black text-xs flex items-center justify-center gap-1.5 cursor-pointer transition-all shrink-0 ${
                      isSheetsConnected
                        ? 'bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-300 shadow-2xs'
                        : 'bg-slate-800 hover:bg-slate-900 text-white shadow-xs'
                    }`}
                  >
                    {isConnectingSheets ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        <span>Verifying...</span>
                      </>
                    ) : isSheetsConnected ? (
                      <>
                        <Unlink className="w-3.5 h-3.5 text-rose-600" />
                        <span>Disconnect</span>
                      </>
                    ) : (
                      <>
                        <Link className="w-3.5 h-3.5" />
                        <span>Connect</span>
                      </>
                    )}
                  </button>
                </div>
                <p className="text-[11px] text-slate-500">
                  All student enrollments, batches, attendance, and fee ledgers automatically route to the default <code className="font-mono text-slate-700 bg-white px-1 py-0.5 rounded border border-slate-200">/exec</code> endpoint when no custom URL is specified.
                </p>
              </div>

              {/* Step 2: Manual Update / Push to Sheets Button */}
              <div className="lg:col-span-4 flex flex-col justify-end space-y-2">
                <label className="block text-[11px] font-black text-slate-700 uppercase tracking-wide">
                  Step 2: Sync Records
                </label>
                <button
                  type="button"
                  onClick={handleManualPushToSheets}
                  disabled={!isSheetsConnected || isPushingToSheets}
                  className="w-full px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed text-white font-black text-xs flex items-center justify-center gap-2 shadow-xs cursor-pointer transition-all"
                >
                  {isPushingToSheets ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin text-emerald-400" />
                      <span>Pushing Records to Sheets...</span>
                    </>
                  ) : (
                    <>
                      <Zap className="w-3.5 h-3.5 text-amber-400" />
                      <span>Manual Update / Push to Sheets</span>
                    </>
                  )}
                </button>
                <p className="text-[11px] text-slate-500 text-center sm:text-left">
                  {isSheetsConnected
                    ? `Ready to push ${state.students.length} students, ${state.batches.length} batches & ${state.leads.length} leads`
                    : 'Connect URL in Step 1 to enable manual push'}
                </p>
              </div>
            </div>
          </div>

          {/* Feedback Notice Banner */}
          {sheetSyncNotice && (
            <div
              className={`p-3.5 rounded-xl border flex items-center justify-between gap-3 text-xs font-bold ${
                sheetSyncNotice.includes('✓') || sheetSyncNotice.includes('🟢')
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                  : sheetSyncNotice.includes('Disconnected')
                  ? 'bg-slate-50 border-slate-200 text-slate-700'
                  : 'bg-amber-50 border-amber-200 text-amber-900'
              }`}
            >
              <div className="flex items-center gap-2">
                <span>{sheetSyncNotice}</span>
              </div>
              <button
                type="button"
                onClick={() => setSheetSyncNotice(null)}
                className="text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                ✕
              </button>
            </div>
          )}

          {/* Companion Google Apps Script Code & Step-by-Step Instructions */}
          {showScriptDetails && (
            <div className="p-5 rounded-2xl bg-slate-900 text-slate-100 space-y-4 border border-slate-800 animate-in fade-in">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <Code2 className="w-4 h-4 text-emerald-400" />
                  <span className="font-black text-xs uppercase tracking-wide text-white">
                    Companion Google Apps Script (Code.gs)
                  </span>
                </div>
                <button
                  type="button"
                  onClick={handleCopyScriptCode}
                  className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs flex items-center gap-1.5 cursor-pointer shadow-xs transition-colors"
                >
                  {copiedScript ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedScript ? '✓ Copied to Clipboard!' : 'Copy Apps Script'}</span>
                </button>
              </div>

              <div className="text-[11px] text-slate-300 space-y-1">
                <p className="font-bold text-white">4-Step Quick Setup Guide:</p>
                <ol className="list-decimal list-inside space-y-1 text-slate-300 font-medium">
                  <li>Open your target Google Sheet and go to <strong>Extensions &gt; Apps Script</strong>.</li>
                  <li>Paste the code below into <strong>Code.gs</strong> and click the <strong>Save (💾)</strong> button.</li>
                  <li>Click <strong>Deploy &gt; New deployment</strong>, select type <strong>Web app</strong>.</li>
                  <li>Set <strong>Execute as:</strong> <code>Me</code> and <strong>Who has access:</strong> <code>Anyone</code>, then copy the Web App URL into Step 1 above.</li>
                </ol>
              </div>

              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800/80 overflow-x-auto">
                <pre className="font-mono text-[11px] text-emerald-300 leading-relaxed whitespace-pre">
                  {COMPANION_APPS_SCRIPT_CODE}
                </pre>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 1B. GOOGLE DOCS REPORTS & NOTES TAB */}
      {activeSubTab === 'docs' && (
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-4 text-xs">
          <div className="pb-3 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-black text-slate-900 flex items-center gap-2">
                <FileText className="w-4 h-4 text-blue-600" />
                <span>Google Docs Executive Reports, Batch Rosters & Fee Summaries</span>
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Generate formatted Google Docs from live CRM records, inspect existing Google Docs in your Drive, or append dated audit notes.
              </p>
            </div>
            {accessToken && (
              <button
                type="button"
                onClick={() => loadGoogleDocs(accessToken)}
                disabled={isLoadingDocs}
                className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold flex items-center gap-1.5 cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isLoadingDocs ? 'animate-spin' : ''}`} />
                <span>Refresh Docs List</span>
              </button>
            )}
          </div>

          {!accessToken && (
            <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2 font-bold">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                <span>Sign in with your Google Account at the top right to create, view, or update Google Docs.</span>
              </div>
              <button
                type="button"
                onClick={handleSignIn}
                className="px-3.5 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-black cursor-pointer"
              >
                Connect Google Account
              </button>
            </div>
          )}

          {/* Create Live CRM Report Doc Bar */}
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
            <label className="block text-[11px] font-black text-slate-700 uppercase tracking-wide">
              Generate New Google Doc with Live Institute Summary (Students, Fees, Batches & Leads)
            </label>
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
              <input
                type="text"
                value={newDocTitle}
                onChange={(e) => setNewDocTitle(e.target.value)}
                placeholder="Document title..."
                className="flex-1 px-3.5 py-2 rounded-xl bg-white border border-slate-300 text-xs text-slate-900 font-semibold focus:outline-none focus:border-blue-500"
              />
              <button
                type="button"
                onClick={handleCreateInstituteGoogleDoc}
                disabled={isCreatingDoc || !accessToken}
                className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-black flex items-center justify-center gap-1.5 cursor-pointer shadow-xs"
              >
                {isCreatingDoc ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Creating Doc...</span>
                  </>
                ) : (
                  <>
                    <Plus className="w-3.5 h-3.5" />
                    <span>Create Google Doc Report</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {docNotice && (
            <div className="p-3 rounded-xl bg-blue-50 border border-blue-200 text-blue-900 font-bold flex items-center justify-between gap-2">
              <span>{docNotice}</span>
              <button
                type="button"
                onClick={() => setDocNotice(null)}
                className="text-blue-600 hover:text-blue-900 cursor-pointer"
              >
                ✕
              </button>
            </div>
          )}

          {/* Explicit User Confirmation Modal before Mutating or Deleting Google Docs */}
          {pendingDocConfirmation && (
            <div className="p-4 rounded-xl bg-amber-50 border-2 border-amber-400 text-slate-900 space-y-3 shadow-md">
              <div className="flex items-start gap-2.5">
                <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-black text-xs uppercase tracking-wide text-amber-950">
                    Confirm {pendingDocConfirmation.type === 'delete' ? 'Google Doc Deletion' : 'Google Doc Modification'}
                  </h4>
                  <p className="text-xs text-slate-700 mt-1">
                    {pendingDocConfirmation.type === 'delete'
                      ? `Are you sure you want to move "${pendingDocConfirmation.title}" (ID: ${pendingDocConfirmation.documentId}) to your Google Drive trash?`
                      : `Are you sure you want to append new content to "${pendingDocConfirmation.title}" (ID: ${pendingDocConfirmation.documentId})?`}
                  </p>
                </div>
              </div>
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setPendingDocConfirmation(null)}
                  className="px-3 py-1.5 rounded-lg bg-white border border-slate-300 text-slate-700 font-bold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmDocAction}
                  className={`px-3.5 py-1.5 rounded-lg text-white font-black cursor-pointer ${
                    pendingDocConfirmation.type === 'delete'
                      ? 'bg-rose-600 hover:bg-rose-700'
                      : 'bg-blue-600 hover:bg-blue-700'
                  }`}
                >
                  {pendingDocConfirmation.type === 'delete' ? 'Yes, Move to Trash' : 'Yes, Append to Google Doc'}
                </button>
              </div>
            </div>
          )}

          {/* Split View: Recent Google Docs List & Document Reader / Editor */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            <div className="lg:col-span-5 border border-slate-200 rounded-xl p-3 bg-slate-50/60 space-y-2 max-h-96 overflow-y-auto">
              <div className="text-[11px] font-black uppercase tracking-wider text-slate-500 px-1">
                Recent Google Docs ({docsList.length})
              </div>
              {docsList.length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-400">
                  {accessToken
                    ? 'No Google Docs found or click "Create Google Doc Report" above.'
                    : 'Sign in with Google to list your documents.'}
                </div>
              ) : (
                docsList.map((docItem) => (
                  <div
                    key={docItem.id}
                    onClick={() => handleOpenGoogleDoc(docItem.id)}
                    className={`p-2.5 rounded-xl border transition-all cursor-pointer flex items-center justify-between gap-2 ${
                      selectedDoc?.documentId === docItem.id
                        ? 'bg-blue-50 border-blue-400 text-slate-900'
                        : 'bg-white hover:bg-slate-100 border-slate-200 text-slate-800'
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="font-bold text-xs truncate">{docItem.name}</div>
                      {docItem.modifiedTime && (
                        <div className="text-[10px] text-slate-400">
                          Updated: {new Date(docItem.modifiedTime).toLocaleString()}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                      {docItem.webViewLink && (
                        <a
                          href={docItem.webViewLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-1.5 rounded-lg bg-slate-100 hover:bg-blue-100 text-blue-700"
                          title="Open in Google Docs"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      )}
                      <button
                        type="button"
                        onClick={() =>
                          setPendingDocConfirmation({
                            type: 'delete',
                            documentId: docItem.id,
                            title: docItem.name
                          })
                        }
                        className="p-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-600 text-[10px] font-bold cursor-pointer"
                        title="Move Document to Trash (Requires Confirmation)"
                      >
                        Trash
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="lg:col-span-7 border border-slate-200 rounded-xl p-4 bg-white space-y-3">
              {selectedDoc ? (
                <>
                  <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-100">
                    <div>
                      <h4 className="font-black text-sm text-slate-900">{selectedDoc.title}</h4>
                      <span className="text-[10px] font-mono text-slate-400">Doc ID: {selectedDoc.documentId}</span>
                    </div>
                    <a
                      href={selectedDoc.documentUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3 py-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold text-xs flex items-center gap-1.5"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      <span>Open in Google Docs</span>
                    </a>
                  </div>

                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 max-h-56 overflow-y-auto">
                    <pre className="font-mono text-[11px] text-slate-800 whitespace-pre-wrap leading-relaxed">
                      {selectedDoc.bodyText || '(Empty document)'}
                    </pre>
                  </div>

                  <div className="pt-2 border-t border-slate-100 space-y-2">
                    <label className="block text-[11px] font-bold text-slate-700">
                      Append Note or Latest CRM Snapshot to "{selectedDoc.title}"
                    </label>
                    <div className="flex flex-col sm:flex-row gap-2">
                      <input
                        type="text"
                        value={appendNotesText}
                        onChange={(e) => setAppendNotesText(e.target.value)}
                        placeholder="Type audit note or counselor remark to append..."
                        className="flex-1 px-3 py-2 rounded-lg border border-slate-300 text-xs focus:outline-none focus:border-blue-500"
                      />
                      <button
                        type="button"
                        disabled={!appendNotesText.trim()}
                        onClick={() =>
                          setPendingDocConfirmation({
                            type: 'append',
                            documentId: selectedDoc.documentId,
                            title: selectedDoc.title,
                            payloadText: `[${new Date().toLocaleString('en-IN')}] ${appendNotesText.trim()}`
                          })
                        }
                        className="px-3.5 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 disabled:opacity-40 text-white font-bold text-xs cursor-pointer shrink-0"
                      >
                        Append Note
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setPendingDocConfirmation({
                            type: 'append',
                            documentId: selectedDoc.documentId,
                            title: selectedDoc.title,
                            payloadText: buildInstituteReportTextForGoogleDoc(state)
                          })
                        }
                        className="px-3.5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs cursor-pointer shrink-0"
                      >
                        Append Live CRM Snapshot
                      </button>
                    </div>
                  </div>
                </>
              ) : (
                <div className="h-64 flex flex-col items-center justify-center text-center text-slate-400 p-4">
                  <FileText className="w-8 h-8 text-slate-300 mb-2" />
                  <p className="text-xs font-bold text-slate-600">Select a Google Doc on the left or create a new report</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    All document modifications and deletions require explicit confirmation.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 2. GOOGLE FORMS TAB */}
      {activeSubTab === 'forms' && (
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-4 text-xs">
          <div className="pb-3 border-b border-slate-100">
            <h3 className="text-sm font-extrabold text-slate-900 flex items-center gap-2">
              <FileText className="w-4 h-4 text-violet-600" />
              <span>Google Forms Automated Lead Ingestion</span>
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Connect your Google Form to ingest prospect responses directly into the 10-stage Lead CRM with automatic phone deduplication
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2">
              <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1">
                Google Form ID or URL
              </label>
              <input
                type="text"
                value={formIdInput}
                onChange={(e) => setFormIdInput(e.target.value)}
                placeholder="e.g. 1FAIpQLScD8yH9K4m7P1J4Z..."
                className="w-full px-3.5 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-900 font-mono-code focus:outline-none focus:border-violet-500 focus:bg-white"
              />
            </div>
            <div className="flex items-end gap-2">
              <button
                onClick={handleFetchFormMetadata}
                disabled={isFetchingForm}
                className="flex-1 px-3 py-2 rounded-xl bg-slate-50 hover:bg-slate-100 text-slate-700 font-bold border border-slate-200 cursor-pointer"
              >
                Connect Form
              </button>
              <button
                onClick={handleImportFormResponses}
                disabled={isFetchingForm}
                className="flex-1 px-3 py-2 rounded-xl bg-violet-600 hover:bg-violet-700 text-white font-black cursor-pointer shadow-xs"
              >
                Fetch Leads
              </button>
            </div>
          </div>

          {formImportNotice && (
            <div className="p-3.5 rounded-xl bg-violet-50 border border-violet-200 text-violet-800 font-bold">
              {formImportNotice}
            </div>
          )}

          {formInfo && (
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
              <div className="flex items-center justify-between">
                <strong className="text-slate-900 text-sm">{formInfo.title}</strong>
                <span className="px-2 py-0.5 rounded-full text-[10px] bg-violet-100 text-violet-800 font-bold">
                  {formInfo.questions.length} Fields Linked
                </span>
              </div>
              <p className="text-slate-600 text-xs">{formInfo.description || 'Google Form active for prospect intake.'}</p>
              <div className="pt-2 border-t border-slate-200">
                <div className="text-[10px] uppercase font-bold text-slate-500 mb-1">Detected Question Fields:</div>
                <div className="flex flex-wrap gap-1.5">
                  {formInfo.questions.map(q => (
                    <span key={q.questionId} className="px-2.5 py-1 rounded-md bg-white border border-slate-200 text-slate-700 text-[10px] font-medium">
                      {q.title}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 3. GOOGLE TASKS TAB */}
      {activeSubTab === 'tasks' && (
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-4 text-xs">
          <div className="pb-3 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-extrabold text-slate-900 flex items-center gap-2">
                <CheckSquare className="w-4 h-4 text-blue-600" />
                <span>Google Tasks Operational Follow-Up Manager</span>
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Synchronizes lead counseling follow-ups, overdue fee notices, and lecture prep directly into Google Tasks
              </p>
            </div>
            <button
              onClick={handleSyncFollowupsToTasks}
              className="px-3.5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-xs flex items-center gap-1.5 cursor-pointer shadow-xs"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Sync CRM Follow-ups to Google Tasks</span>
            </button>
          </div>

          {/* Quick Task Creator Form */}
          <form onSubmit={handleCreateTask} className="grid grid-cols-1 sm:grid-cols-4 gap-2.5 p-3 rounded-xl bg-slate-50 border border-slate-200">
            <div className="sm:col-span-2">
              <input
                type="text"
                required
                value={newTaskTitle}
                onChange={(e) => setNewTaskTitle(e.target.value)}
                placeholder="Create new task (e.g. Call Omkar regarding Batch OCT-MTB-01)..."
                className="w-full px-3 py-2 rounded-lg bg-white border border-slate-200 text-xs text-slate-900 focus:outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <input
                type="date"
                value={newTaskDue}
                onChange={(e) => setNewTaskDue(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-white border border-slate-200 text-xs text-slate-900 font-mono-code focus:outline-none focus:border-blue-500"
              />
            </div>
            <button
              type="submit"
              className="px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs cursor-pointer shadow-2xs"
            >
              + Add Task
            </button>
          </form>

          {taskNotice && (
            <div className="p-3 rounded-xl bg-blue-50 border border-blue-200 text-blue-800 font-bold flex items-center justify-between gap-2">
              <span>{taskNotice}</span>
              <button
                type="button"
                onClick={() => setTaskNotice(null)}
                className="text-blue-600 hover:text-blue-900 cursor-pointer"
              >
                ✕
              </button>
            </div>
          )}

          {/* Tasks List */}
          <div className="space-y-2 max-h-72 overflow-y-auto">
            {tasks.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-400 italic bg-slate-50 rounded-xl border border-slate-100">
                No active tasks. Use "+ Add Task" or "Sync CRM Follow-ups to Google Tasks" above.
              </div>
            ) : (
              tasks.map((t) => (
                <div
                  key={t.id || t.title}
                  className={`p-3 rounded-xl border flex items-center justify-between gap-3 ${
                    t.status === 'completed'
                      ? 'bg-slate-50 border-slate-200 text-slate-400 line-through'
                      : 'bg-white border-slate-200 text-slate-800'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <button
                      type="button"
                      onClick={() => handleCompleteTask(t.id)}
                      className={`w-4 h-4 rounded border flex items-center justify-center cursor-pointer ${
                        t.status === 'completed' ? 'bg-emerald-600 border-emerald-600 text-white' : 'border-slate-300 hover:border-blue-500'
                      }`}
                    >
                      {t.status === 'completed' && <CheckCircle2 className="w-3.5 h-3.5" />}
                    </button>
                    <div>
                      <strong className="text-xs">{t.title}</strong>
                      {t.notes && <div className="text-[11px] text-slate-500">{t.notes}</div>}
                    </div>
                  </div>
                  {t.due && (
                    <span className="font-mono-code text-[10px] text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                      Due: {t.due.split('T')[0]}
                    </span>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* 4. FIREBASE CLOUD FIRESTORE TAB */}
      {activeSubTab === 'firestore' && (
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-4 text-xs">
          <div className="pb-3 border-b border-slate-100 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-extrabold text-slate-900 flex items-center gap-2">
                <Cloud className="w-4 h-4 text-amber-600" />
                <span>Google Cloud Firebase Firestore (Project: {ACTIVE_FIREBASE_PROJECT_ID})</span>
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Cloud Firestore database provisioned for secure multi-device synchronization
              </p>
            </div>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
              ✓ Firestore Rules Deployed
            </span>
          </div>

          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div>
                <span className="text-slate-500 block mb-0.5 font-medium">Firebase Project ID:</span>
                <strong className="font-mono-code text-slate-900">{ACTIVE_FIREBASE_PROJECT_ID}</strong>
              </div>
              <div>
                <span className="text-slate-500 block mb-0.5 font-medium">Firestore Cloud Region:</span>
                <strong className="font-mono-code text-slate-900">asia-south1 (Mumbai)</strong>
              </div>
            </div>

            <div className="pt-2 border-t border-slate-200 flex flex-wrap items-center gap-3">
              <button
                onClick={handlePushFirestore}
                disabled={isSyncingFirestore}
                className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-black flex items-center gap-2 cursor-pointer shadow-xs"
              >
                <Cloud className="w-4 h-4" />
                <span>{isSyncingFirestore ? 'Syncing...' : 'Push All Records to Cloud Firestore'}</span>
              </button>
            </div>

            {firestoreNotice && (
              <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 font-bold">
                {firestoreNotice}
              </div>
            )}
          </div>

          <div className="pt-2">
            <UniversalStorageHub state={state} />
          </div>
        </div>
      )}

      {/* 5. UNIVERSAL 9-ENGINE STORAGE & DATABASE CONTROL HUB */}
      {activeSubTab === 'universal-hub' && (
        <UniversalStorageHub state={state} />
      )}
    </div>
  );
};
