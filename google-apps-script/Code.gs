/**
 * =========================================================================
 * SRUJAAN SHARE MARKET INSTITUTE — CLOUD SYNC & MASTER BACKEND (Code.gs)
 * Account: srujaansharemarketpune@gmail.com
 * =========================================================================
 *
 * INSTRUCTIONS TO DEPLOY:
 * 1. Open https://script.google.com logged in as srujaansharemarketpune@gmail.com
 * 2. Create a New Project: "Srujaan Share Market Institute - Master Backend"
 * 3. Replace all text in Code.gs with this exact file and click Save (Ctrl+S).
 * 4. Run `setupSrujaanBackend()` once from the editor toolbar to automatically:
 *    - Create "Srujaan Share Market Institute - Master Database" in Google Drive.
 *    - Create "Srujaan Share Market Institute - Admission & Inquiry Form" linked to it.
 *    - Install onFormSubmit trigger for real-time automatic form entry formatting.
 * 5. Click "Deploy" > "New deployment" > Select type: "Web app".
 *    - Description: "Srujaan Production Backend v2.0"
 *    - Execute as: "Me (srujaansharemarketpune@gmail.com)"
 *    - Who has access: "Anyone"
 * 6. Copy the resulting Web App URL (ends in /exec) and paste into your CRM settings.
 * =========================================================================
 */

var MASTER_SHEET_NAME = "Srujaan Share Market Institute - Master Database";
var MASTER_FORM_NAME = "Srujaan Share Market Institute - Admission & Inquiry Form";
var INSTITUTION_EMAIL = "srujaansharemarketpune@gmail.com";

var HEADERS = [
  "Record ID",
  "Timestamp",
  "Student Name",
  "Mobile",
  "Email",
  "Course",
  "Branch",
  "Fee Amount",
  "Fee Status",
  "Source",
  "Notes"
];

/**
 * 1. AUTO-PROVISIONING SETUP FUNCTION
 * Run this function once from the Google Apps Script editor.
 */
function setupSrujaanBackend() {
  Logger.log("=== STARTING SRUJAAN SHARE MARKET INSTITUTE BACKEND SETUP ===");
  
  // Step 1: Find or Create Master Google Sheet
  var files = DriveApp.getFilesByName(MASTER_SHEET_NAME);
  var spreadsheet;
  if (files.hasNext()) {
    spreadsheet = SpreadsheetApp.open(files.next());
    Logger.log("Found existing Master Spreadsheet: " + spreadsheet.getUrl());
  } else {
    spreadsheet = SpreadsheetApp.create(MASTER_SHEET_NAME);
    Logger.log("Created NEW Master Spreadsheet: " + spreadsheet.getUrl());
  }

  var sheet = spreadsheet.getActiveSheet();
  sheet.setName("Master Database");

  // Format Headers if not already formatted
  var existingHeaders = sheet.getLastRow() > 0 ? sheet.getRange(1, 1, 1, HEADERS.length).getValues()[0] : [];
  var isHeaderPresent = existingHeaders[0] === HEADERS[0];

  if (!isHeaderPresent) {
    if (sheet.getLastRow() > 0) {
      sheet.insertRowsBefore(1, 1);
    }
    var headerRange = sheet.getRange(1, 1, 1, HEADERS.length);
    headerRange.setValues([HEADERS]);
    headerRange.setFontWeight("bold");
    headerRange.setBackground("#1e1b4b"); // Deep Indigo
    headerRange.setFontColor("#ffffff");
    headerRange.setHorizontalAlignment("center");
    sheet.setFrozenRows(1);
    
    // Auto-fit column widths
    for (var col = 1; col <= HEADERS.length; col++) {
      sheet.autoResizeColumn(col);
    }
    Logger.log("Formatted Master Database header row.");
  }

  // Step 2: Find or Create Linked Google Form
  var formFiles = DriveApp.getFilesByName(MASTER_FORM_NAME);
  var form;
  if (formFiles.hasNext()) {
    form = FormApp.open(formFiles.next());
    Logger.log("Found existing Google Form: " + form.getEditUrl());
  } else {
    form = FormApp.create(MASTER_FORM_NAME);
    form.setTitle(MASTER_FORM_NAME)
        .setDescription("Official Admission & Inquiry Registration Portal — Srujaan Share Market Institute Pune.\nWhere Knowledge Meets Profit.")
        .setConfirmationMessage("Thank you for choosing Srujaan Share Market Institute! Our senior admissions counselor will connect with you shortly.")
        .setAllowResponseEdits(false)
        .setAcceptingResponses(true);

    // Form Items
    form.addTextItem().setTitle("Student Name").setRequired(true);
    form.addTextItem().setTitle("Mobile Number (WhatsApp)").setRequired(true);
    form.addTextItem().setTitle("Email Address").setRequired(false);

    var courseItem = form.addListItem();
    courseItem.setTitle("Course Interested In")
      .setChoiceValues([
        "Basic Course",
        "Advance Stock Market",
        "Futures & Options",
        "Forex & Crypto",
        "Complete Trader Program",
        "Custom Course"
      ])
      .setRequired(true);

    var branchItem = form.addListItem();
    branchItem.setTitle("Preferred Branch")
      .setChoiceValues([
        "Sane Chowk (Chinchwad)",
        "Patil Nagar (Chikhali)",
        "Solapur",
        "Online / Hybrid"
      ])
      .setRequired(true);

    form.addTextItem().setTitle("Fee Amount (if paid)").setRequired(false);

    var feeStatusItem = form.addListItem();
    feeStatusItem.setTitle("Fee Payment Status")
      .setChoiceValues(["Pending", "Partial", "Paid"])
      .setRequired(false);

    form.addParagraphTextItem().setTitle("Questions / Notes / Experience").setRequired(false);

    // Link form to spreadsheet
    form.setDestination(FormApp.DestinationType.SPREADSHEET, spreadsheet.getId());
    Logger.log("Created NEW Google Form and linked to spreadsheet.");
  }

  // Step 3: Install or verify onFormSubmit trigger
  var triggers = ScriptApp.getProjectTriggers();
  var triggerInstalled = false;
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === "onFormSubmitHandler") {
      triggerInstalled = true;
      break;
    }
  }

  if (!triggerInstalled) {
    ScriptApp.newTrigger("onFormSubmitHandler")
      .forSpreadsheet(spreadsheet)
      .onFormSubmit()
      .create();
    Logger.log("Installed onFormSubmit trigger for automatic master database formatting.");
  }

  // Log all URLs clearly
  var sheetUrl = spreadsheet.getUrl();
  var formPublishedUrl = form.getPublishedUrl();
  var formEmbedUrl = '<iframe src="' + formPublishedUrl + '?embedded=true" width="640" height="800" frameborder="0" marginheight="0" marginwidth="0">Loading…</iframe>';

  Logger.log("\n=======================================================");
  Logger.log("✅ SRUJAAN SHARE MARKET INSTITUTE SETUP COMPLETE!");
  Logger.log("=======================================================");
  Logger.log("📊 MASTER GOOGLE SHEET URL:\n" + sheetUrl);
  Logger.log("\n📋 PUBLIC GOOGLE FORM URL:\n" + formPublishedUrl);
  Logger.log("\n🌐 FORM EMBED HTML:\n" + formEmbedUrl);
  Logger.log("=======================================================\n");

  return {
    status: "success",
    sheetUrl: sheetUrl,
    formUrl: formPublishedUrl,
    embedUrl: formEmbedUrl
  };
}

/**
 * 2. AUTOMATIC FORM SUBMIT TRIGGER
 * Fires automatically when anyone submits the linked Google Form.
 */
function onFormSubmitHandler(e) {
  try {
    var files = DriveApp.getFilesByName(MASTER_SHEET_NAME);
    if (!files.hasNext()) return;
    var spreadsheet = SpreadsheetApp.open(files.next());
    var masterSheet = spreadsheet.getSheetByName("Master Database") || spreadsheet.getActiveSheet();

    var namedValues = e ? e.namedValues : {};
    var timestamp = e ? (e.values ? e.values[0] : new Date()) : new Date();
    
    // Extract fields safely
    var name = (namedValues["Student Name"] && namedValues["Student Name"][0]) || (e.values && e.values[1]) || "New Prospect";
    var mobile = (namedValues["Mobile Number (WhatsApp)"] && namedValues["Mobile Number (WhatsApp)"][0]) || (e.values && e.values[2]) || "";
    var email = (namedValues["Email Address"] && namedValues["Email Address"][0]) || "";
    var course = (namedValues["Course Interested In"] && namedValues["Course Interested In"][0]) || "Stock Market Course";
    var branch = (namedValues["Preferred Branch"] && namedValues["Preferred Branch"][0]) || "Sane Chowk";
    var feeAmount = (namedValues["Fee Amount (if paid)"] && namedValues["Fee Amount (if paid)"][0]) || "0";
    var feeStatus = (namedValues["Fee Payment Status"] && namedValues["Fee Payment Status"][0]) || "Pending";
    var notes = (namedValues["Questions / Notes / Experience"] && namedValues["Questions / Notes / Experience"][0]) || "Submitted via Google Form";

    var recordId = "GF_" + new Date().getTime() + "_" + Math.floor(Math.random() * 1000);

    // Append to Master Database
    masterSheet.appendRow([
      recordId,
      new Date().toISOString(),
      name,
      mobile,
      email,
      course,
      branch,
      feeAmount,
      feeStatus,
      "Google Form",
      notes
    ]);

    Logger.log("Handled form submission for: " + name + " (" + mobile + ")");
  } catch (err) {
    Logger.log("Error in onFormSubmitHandler: " + err.toString());
  }
}

/**
 * 3. BIDIRECTIONAL API — doPost(e)
 * Handles incoming data sync from the CRM web app.
 * CORS note: Web app sends text/plain body, parsed as JSON here.
 */
function doPost(e) {
  try {
    var rawContents = (e && e.postData && e.postData.contents) ? e.postData.contents : "{}";
    var data = JSON.parse(rawContents);

    var files = DriveApp.getFilesByName(MASTER_SHEET_NAME);
    var spreadsheet;
    if (files.hasNext()) {
      spreadsheet = SpreadsheetApp.open(files.next());
    } else {
      setupSrujaanBackend();
      spreadsheet = SpreadsheetApp.open(DriveApp.getFilesByName(MASTER_SHEET_NAME).next());
    }

    var sheet = spreadsheet.getSheetByName("Master Database") || spreadsheet.getActiveSheet();

    // Ping check
    if (data.action === "ping") {
      return createJsonResponse({
        status: "success",
        message: "Srujaan Google Apps Script Backend Online & Running",
        account: INSTITUTION_EMAIL,
        sheetUrl: spreadsheet.getUrl(),
        timestamp: new Date().toISOString()
      });
    }

    // Extract records to sync
    var recordsToProcess = [];
    if (Array.isArray(data.records)) {
      recordsToProcess = data.records;
    } else if (data.record && typeof data.record === "object") {
      recordsToProcess = [data.record];
    } else if (data.data && typeof data.data === "object") {
      if (Array.isArray(data.data.students)) {
        recordsToProcess = data.data.students;
      } else {
        recordsToProcess = [data.data];
      }
    } else if (data.name || data.studentName) {
      recordsToProcess = [data];
    }

    // Build map of existing Record IDs in the Master Sheet (Column 1)
    var lastRow = sheet.getLastRow();
    var idRowMap = {};
    if (lastRow > 1) {
      var existingIds = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
      for (var r = 0; r < existingIds.length; r++) {
        var idVal = String(existingIds[r][0]).trim();
        if (idVal) {
          idRowMap[idVal] = r + 2; // 1-indexed row number
        }
      }
    }

    var updatedCount = 0;
    var insertedCount = 0;

    recordsToProcess.forEach(function(rec) {
      var recordId = String(rec.record_id || rec.recordId || rec.id || "").trim();
      if (!recordId) {
        var cleanPhone = String(rec.phone || rec.mobile || "").replace(/\D/g, "").slice(-10);
        recordId = cleanPhone ? "STU_" + cleanPhone : "REC_" + new Date().getTime();
      }

      var rowData = [
        recordId,
        rec.updated_at || rec.updatedAt || rec.timestamp || new Date().toISOString(),
        rec.name || rec.studentName || rec.fullName || "Student",
        rec.phone || rec.mobile || rec.contact || "",
        rec.email || "",
        rec.course || "Stock Market Course",
        rec.branch || "Sane Chowk",
        rec.netFee || rec.feeAmount || rec.amount || "0",
        rec.feeStatus || rec.feesStatus || "Pending",
        rec.source || "Web App Sync",
        rec.notes || rec.counselorNotes || ""
      ];

      if (idRowMap[recordId]) {
        // Update existing row
        var rowNum = idRowMap[recordId];
        sheet.getRange(rowNum, 1, 1, HEADERS.length).setValues([rowData]);
        updatedCount++;
      } else {
        // Append new row
        sheet.appendRow(rowData);
        idRowMap[recordId] = sheet.getLastRow();
        insertedCount++;
      }
    });

    return createJsonResponse({
      status: "success",
      message: "Sync completed successfully",
      syncedCount: recordsToProcess.length,
      insertedCount: insertedCount,
      updatedCount: updatedCount,
      totalRows: sheet.getLastRow() - 1,
      sheetUrl: spreadsheet.getUrl(),
      account: INSTITUTION_EMAIL,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    Logger.log("doPost error: " + error.toString());
    return createJsonResponse({
      status: "error",
      message: error.toString(),
      account: INSTITUTION_EMAIL
    });
  }
}

/**
 * 4. BIDIRECTIONAL API — doGet(e)
 * Reads all master records from the Master Sheet and returns clean JSON.
 */
function doGet(e) {
  try {
    var files = DriveApp.getFilesByName(MASTER_SHEET_NAME);
    if (!files.hasNext()) {
      return createJsonResponse({
        status: "success",
        count: 0,
        records: [],
        message: "Master Database not yet initialized. Run setupSrujaanBackend() once."
      });
    }

    var spreadsheet = SpreadsheetApp.open(files.next());
    var sheet = spreadsheet.getSheetByName("Master Database") || spreadsheet.getActiveSheet();
    var lastRow = sheet.getLastRow();

    if (lastRow <= 1) {
      return createJsonResponse({
        status: "success",
        count: 0,
        records: [],
        sheetUrl: spreadsheet.getUrl()
      });
    }

    var values = sheet.getRange(2, 1, lastRow - 1, HEADERS.length).getValues();
    var records = [];

    for (var i = 0; i < values.length; i++) {
      var row = values[i];
      records.push({
        record_id: String(row[0] || ""),
        timestamp: row[1] || "",
        studentName: row[2] || "",
        name: row[2] || "",
        mobile: String(row[3] || ""),
        phone: String(row[3] || ""),
        email: row[4] || "",
        course: row[5] || "",
        branch: row[6] || "",
        feeAmount: Number(row[7]) || 0,
        netFee: Number(row[7]) || 0,
        feeStatus: row[8] || "Pending",
        source: row[9] || "Master Sheet",
        notes: row[10] || ""
      });
    }

    // Get Form URL if available
    var formUrl = "";
    var formFiles = DriveApp.getFilesByName(MASTER_FORM_NAME);
    if (formFiles.hasNext()) {
      formUrl = FormApp.open(formFiles.next()).getPublishedUrl();
    }

    return createJsonResponse({
      status: "success",
      count: records.length,
      records: records,
      sheetUrl: spreadsheet.getUrl(),
      formUrl: formUrl,
      account: INSTITUTION_EMAIL,
      timestamp: new Date().toISOString()
    });

  } catch (err) {
    return createJsonResponse({
      status: "error",
      message: err.toString()
    });
  }
}

/**
 * Helper to build JSON ContentService output
 */
function createJsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
