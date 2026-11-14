import { AppState, WhatsAppPreset } from '../types';

export const LIVE_TODAY_ISO = new Date().toISOString().split('T')[0];

export const LEAD_STAGES = [
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
] as const;

export const ATTENDANCE_STATUSES = [
  'Present',
  'Absent',
  'Late',
  'Excused Leave',
  'Not Marked'
] as const;

export const DEFAULT_WHATSAPP_PRESETS: WhatsAppPreset[] = [
  // --- 23 LEAD CONVERSION SCENARIOS ---
  {
    id: 'TPL-LEAD-01', category: 'Lead Conversion', scenario: 'New Enquiry', tone: 'Friendly',
    title: '1. New Enquiry Welcome & Introduction',
    en: 'Hello {{lead_name}}! 🙏 Thank you for contacting *{{institute_name}}* regarding *{{course_name}}*. Led by {{instructor_name}}, our practical curriculum covers everything step-by-step. Would you prefer an Offline Classroom or Online Live batch?',
    hi: 'नमस्ते {{lead_name}}! 🙏 *{{course_name}}* के लिए *{{institute_name}}* से संपर्क करने के लिए धन्यवाद। {{instructor_name}} के मार्गदर्शन में हमारा कोर्स पूर्णतः व्यावहारिक है। क्या आप ऑफलाइन या ऑनलाइन बैच पसंद करेंगे?',
    mr: 'नमस्कार {{lead_name}}! 🙏 *{{course_name}}* कोर्ससाठी *{{institute_name}}* शी संपर्क साधल्याबद्दल धन्यवाद. {{instructor_name}} यांच्या मार्गदर्शनाखालील हा कोर्स अत्यंत प्रॅक्टिकल आहे. तुम्हाला ऑफलाईन की ऑनलाईन बॅच सोयीची पडेल?'
  },
  {
    id: 'TPL-LEAD-02', category: 'Lead Conversion', scenario: 'Course Information', tone: 'Professional',
    title: '2. Complete Course Information Overview',
    en: 'Dear {{lead_name}}, here are the key highlights for *{{course_name}}* at *{{institute_name}}*:\n• Mentor: {{instructor_name}}\n• Upcoming Batch: {{batch_name}} ({{lecture_time}})\n• Hands-on practical sessions & study materials included.\nLet us know if you have any questions!',
    hi: 'प्रिय {{lead_name}}, *{{institute_name}}* के *{{course_name}}* की मुख्य जानकारी:\n• प्रशिक्षक: {{instructor_name}}\n• आगामी बैच: {{batch_name}} ({{lecture_time}})\n• प्रैक्टिकल सत्र और अध्ययन सामग्री शामिल है। किसी भी प्रश्न के लिए रिप्लाई करें!',
    mr: 'प्रिय {{lead_name}}, *{{institute_name}}* मधील *{{course_name}}* कोर्सची मुख्य माहिती:\n• मार्गदर्शक: {{instructor_name}}\n• आगामी बॅच: {{batch_name}} ({{lecture_time}})\n• प्रत्यक्ष सराव आणि अभ्यास साहित्य समाविष्ट. काही शंका असल्यास नक्की कळवा!'
  },
  {
    id: 'TPL-LEAD-03', category: 'Lead Conversion', scenario: 'Course Fees', tone: 'Professional',
    title: '3. Course Fee Structure & Installment Clarity',
    en: 'Hello {{lead_name}}, the standard fee for *{{course_name}}* at *{{institute_name}}* is *{{fees}}*. We also support structured milestone installments so you can start comfortably. Reply here if you would like the installment schedule.',
    hi: 'नमस्ते {{lead_name}}, *{{institute_name}}* में *{{course_name}}* का निर्धारित शुल्क *{{fees}}* है। सुविधा के लिए आसान किस्त (Installment) विकल्प भी उपलब्ध हैं। किस्त विवरण के लिए रिप्लाई करें।',
    mr: 'नमस्कार {{lead_name}}, *{{institute_name}}* मध्ये *{{course_name}}* ची अधिकृत फी *{{fees}}* आहे. विद्यार्थ्यांच्या सोयीसाठी सोपे हप्ते (Installments) सुविधा देखील उपलब्ध आहे. अधिक माहितीसाठी रिप्लाय करा.'
  },
  {
    id: 'TPL-LEAD-04', category: 'Lead Conversion', scenario: 'Course Duration & Syllabus', tone: 'Professional',
    title: '4. Course Duration & Module-Wise Syllabus',
    en: 'Hello {{lead_name}}, *{{course_name}}* at *{{institute_name}}* runs in structured daily/weekend sessions ({{lecture_time}}) covering foundational concepts, live practical execution, risk control, and assessments under {{instructor_name}}.',
    hi: 'नमस्ते {{lead_name}}, *{{institute_name}}* में *{{course_name}}* के अंतर्गत फाउंडेशन से लेकर एडवांस्ड प्रैक्टिकल अभ्यास तक चरणबद्ध पाठ्यक्रम ({{lecture_time}}) {{instructor_name}} द्वारा सिखाया जाता है।',
    mr: 'नमस्कार {{lead_name}}, *{{institute_name}}* मधील *{{course_name}}* कोर्समध्ये पायाभूत संकल्पनांपासून प्रत्यक्ष प्रॅक्टिकल सरावापर्यंत सर्व मॉड्यूल्स ({{lecture_time}}) {{instructor_name}} यांच्याकडून शिकवले जातात.'
  },
  {
    id: 'TPL-LEAD-05', category: 'Lead Conversion', scenario: 'Beginner Suitability', tone: 'Friendly',
    title: '5. Absolute Beginner Suitability Assurance',
    en: 'Hi {{lead_name}}! Yes, *{{course_name}}* at *{{institute_name}}* is 100% suitable for beginners. We start from zero fundamentals before moving to practical exercises, with personal guidance from {{instructor_name}}.',
    hi: 'नमस्ते {{lead_name}}! जी हाँ, *{{course_name}}* नए विद्यार्थियों (Beginners) के लिए पूरी तरह उपयुक्त है। *{{institute_name}}* में हम बिल्कुल शून्य (बेसिक) से शुरुआत करते हैं।',
    mr: 'नमस्कार {{lead_name}}! हो, *{{course_name}}* हा कोर्स नवीन शिकणाऱ्यांसाठी (Beginners) १००% उपयुक्त आहे. *{{institute_name}}* मध्ये आपण अगदी शून्यापासून सुरुवात करतो.'
  },
  {
    id: 'TPL-LEAD-06', category: 'Lead Conversion', scenario: 'Online vs Offline Batches', tone: 'Professional',
    title: '6. Online vs. Offline Classroom Batch Options',
    en: 'Hello {{lead_name}}, *{{institute_name}}* offers *{{course_name}}* in both modes:\n1) Offline Classroom at Pune Campus ({{batch_name}})\n2) Interactive Online Live Batch ({{lecture_time}})\nBoth include full doubt-solving with {{instructor_name}}.',
    hi: 'नमस्ते {{lead_name}}, *{{institute_name}}* में *{{course_name}}* दोनों माध्यमों में उपलब्ध है:\n1) पुणे कैंपस में ऑफलाइन क्लासरूम ({{batch_name}})\n2) लाइव इंटरएक्टिव ऑनलाइन बैच ({{lecture_time}})\nदोनों में {{instructor_name}} का सीधा मार्गदर्शन मिलता है।',
    mr: 'नमस्कार {{lead_name}}, *{{institute_name}}* मध्ये *{{course_name}}* दोन्ही प्रकारे उपलब्ध आहे:\n१) पुणे कॅम्पस येथे ऑफलाईन क्लासरूम ({{batch_name}})\n२) लाईव्ह इंटरॅक्टिव्ह ऑनलाईन बॅच ({{lecture_time}})\nदोन्हीमध्ये {{instructor_name}} यांचे थेट मार्गदर्शन मिळते.'
  },
  {
    id: 'TPL-LEAD-07', category: 'Lead Conversion', scenario: 'Demo Invitation', tone: 'Persuasive-but-Honest',
    title: '7. Complimentary Demo & Counseling Invitation',
    en: 'Hello {{lead_name}}! You are invited to a complimentary Demo & Counseling session for *{{course_name}}* at *{{institute_name}}* on *{{follow_up_date}}* ({{lecture_time}}) with {{instructor_name}}. Reply YES to reserve your seat!',
    hi: 'नमस्ते {{lead_name}}! *{{institute_name}}* में *{{course_name}}* के निःशुल्क डेमो और काउंसलिंग सत्र (*{{follow_up_date}}*, {{lecture_time}}) में आपका स्वागत है। अपनी सीट आरक्षित करने के लिए YES रिप्लाई करें!',
    mr: 'नमस्कार {{lead_name}}! *{{institute_name}}* तर्फे *{{course_name}}* च्या मोफत डेमो आणि समुपदेशन सत्रासाठी (*{{follow_up_date}}*, {{lecture_time}}) आपणास निमंत्रित करीत आहोत. जागा राखीव ठेवण्यासाठी YES रिप्लाय करा!'
  },
  {
    id: 'TPL-LEAD-08', category: 'Lead Conversion', scenario: 'Demo Confirmation', tone: 'Short',
    title: '8. Demo Session Seat & Timing Confirmation',
    en: 'Confirmed! ✅ Hi {{lead_name}}, your demo session for *{{course_name}}* at *{{institute_name}}* is confirmed for *{{follow_up_date}}* at *{{lecture_time}}*. Please bring a notebook. See you soon!',
    hi: 'कन्फर्म! ✅ नमस्ते {{lead_name}}, *{{institute_name}}* में *{{course_name}}* के लिए आपका डेमो सत्र *{{follow_up_date}}* को *{{lecture_time}}* बजे निश्चित हो गया है।',
    mr: 'कन्फर्म! ✅ नमस्कार {{lead_name}}, *{{institute_name}}* मध्ये *{{course_name}}* साठी आपले डेमो सत्र *{{follow_up_date}}* रोजी *{{lecture_time}}* वाजता निश्चित झाले आहे.'
  },
  {
    id: 'TPL-LEAD-09', category: 'Lead Conversion', scenario: 'Follow-up After Demo', tone: 'Friendly',
    title: '9. Post-Demo Feedback & Enrollment Follow-Up',
    en: 'Hello {{lead_name}}! Thank you for attending the *{{course_name}}* demo at *{{institute_name}}*. We hope you enjoyed {{instructor_name}}\'s teaching style. Admissions for batch *{{batch_name}}* ({{fees}}) are open—how would you like to proceed?',
    hi: 'नमस्ते {{lead_name}}! *{{institute_name}}* में *{{course_name}}* के डेमो में शामिल होने के लिए धन्यवाद। बैच *{{batch_name}}* के लिए प्रवेश चालू हैं। क्या आपका कोई प्रश्न है?',
    mr: 'नमस्कार {{lead_name}}! *{{institute_name}}* मधील *{{course_name}}* डेमो सत्रात सहभागी झाल्याबद्दल धन्यवाद. बॅच *{{batch_name}}* चे प्रवेश सुरू आहेत—आपण प्रवेशाबाबत कसे पुढे जायचे?'
  },
  {
    id: 'TPL-LEAD-10', category: 'Lead Conversion', scenario: 'No Response', tone: 'Short',
    title: '10. Gentle Check-In After No Response',
    en: 'Hi {{lead_name}}, just checking in from *{{institute_name}}* regarding your enquiry for *{{course_name}}*. Are you still looking to join the upcoming batch *{{batch_name}}*?',
    hi: 'नमस्ते {{lead_name}}, *{{institute_name}}* से *{{course_name}}* के संबंध में छोटा सा फॉलो-अप। क्या आप आगामी बैच *{{batch_name}}* से जुड़ना चाहते हैं?',
    mr: 'नमस्कार {{lead_name}}, *{{institute_name}}* मधून *{{course_name}}* चौकशी संदर्भात आठवण. आपण आगामी *{{batch_name}}* बॅचमध्ये प्रवेश घेण्यास इच्छुक आहात का?'
  },
  {
    id: 'TPL-LEAD-11', category: 'Lead Conversion', scenario: 'Fees Considered Expensive', tone: 'Persuasive-but-Honest',
    title: '11. Value & Installment Response When Fees Feel High',
    en: 'Dear {{lead_name}}, we completely understand budget considerations. At *{{institute_name}}*, *{{course_name}}* ({{fees}}) includes live mentorship by {{instructor_name}}, small batch size ({{batch_name}}), and practical desk review—plus you can split the fee into convenient installments.',
    hi: 'प्रिय {{lead_name}}, हम बजट के महत्व को समझते हैं। *{{institute_name}}* में *{{course_name}}* ({{fees}}) में {{instructor_name}} का प्रत्यक्ष मार्गदर्शन और प्रैक्टिकल अभ्यास शामिल है, और आप शुल्क को आसान किस्तों में भी दे सकते हैं।',
    mr: 'प्रिय {{lead_name}}, आम्ही आपल्या बजेटचा पूर्ण आदर करतो. *{{institute_name}}* मधील *{{course_name}}* ({{fees}}) मध्ये {{instructor_name}} यांचे वैयक्तिक लक्ष आणि प्रत्यक्ष सराव मिळतो, शिवाय आपण फी सोप्या हप्त्यांमध्ये भरू शकता.'
  },
  {
    id: 'TPL-LEAD-12', category: 'Lead Conversion', scenario: 'Wants to Consult Family', tone: 'Friendly',
    title: '12. Brochure & Summary for Family Consultation',
    en: 'Hello {{lead_name}}, discussing with family is a great decision! Feel free to share these details of *{{course_name}}* at *{{institute_name}}* (Mentor: {{instructor_name}}, Batch: {{batch_name}}, Fee: {{fees}}). Family members are also welcome to visit our campus!',
    hi: 'नमस्ते {{lead_name}}, परिवार से सलाह लेना एक अच्छा निर्णय है! आप *{{institute_name}}* के *{{course_name}}* (प्रशिक्षक: {{instructor_name}}, शुल्क: {{fees}}) की जानकारी साझा कर सकते हैं। परिवार के सदस्य भी कैंपस आ सकते हैं!',
    mr: 'नमस्कार {{lead_name}}, कुटुंबाशी चर्चा करणे हा उत्तम निर्णय आहे! *{{institute_name}}* मधील *{{course_name}}* (मार्गदर्शक: {{instructor_name}}, फी: {{fees}}) ची माहिती आपण घरच्यांशी शेअर करू शकता. पालकही इन्स्टिट्यूटला भेट देऊ शकतात!'
  },
  {
    id: 'TPL-LEAD-13', category: 'Lead Conversion', scenario: 'Admission Confirmation', tone: 'Professional',
    title: '13. Lead Admission & Seat Confirmation Message',
    en: 'Congratulations {{lead_name}}! 🎉 Your admission for *{{course_name}}* in batch *{{batch_name}}* at *{{institute_name}}* is confirmed. Classes run at {{lecture_time}} starting {{lecture_date}}.',
    hi: 'बधाई हो {{lead_name}}! 🎉 *{{institute_name}}* में *{{course_name}}* के बैच *{{batch_name}}* में आपका प्रवेश सुनिश्चित हो गया है। कक्षाएं {{lecture_date}} से {{lecture_time}} बजे शुरू होंगी।',
    mr: 'अभिनंदन {{lead_name}}! 🎉 *{{institute_name}}* मधील *{{course_name}}* च्या *{{batch_name}}* बॅचमध्ये आपला प्रवेश निश्चित झाला आहे. लेक्चर्स {{lecture_date}} पासून {{lecture_time}} वाजता सुरू होतील.'
  },

  // --- STUDENT COMMUNICATION SCENARIOS ---
  {
    id: 'TPL-STU-01', category: 'Student Communication', scenario: 'Upcoming Lecture Reminder', tone: 'Short',
    title: '14. Daily Upcoming Lecture Reminder',
    en: 'Reminder ⏰: Hello {{student_name}}, your *{{course_name}}* lecture for Batch *{{batch_name}}* starts on *{{lecture_date}}* at *{{lecture_time}}* at *{{institute_name}}*. Please be on time!',
    hi: 'रिमाइंडर ⏰: नमस्ते {{student_name}}, बैच *{{batch_name}}* (*{{course_name}}*) की क्लास *{{lecture_date}}* को *{{lecture_time}}* बजे शुरू होगी। कृपया समय पर उपस्थित रहें!',
    mr: 'आठवण ⏰: नमस्कार {{student_name}}, बॅच *{{batch_name}}* (*{{course_name}}*) चे लेक्चर *{{lecture_date}}* रोजी *{{lecture_time}}* वाजता सुरू होईल. कृपया वेळेवर उपस्थित रहा!'
  },
  {
    id: 'TPL-STU-02', category: 'Student Communication', scenario: 'Consecutive Absences', tone: 'Professional',
    title: '15. Consecutive Absences & Low Attendance Care Alert',
    en: 'Dear {{student_name}}, our attendance register shows consecutive absences in Batch *{{batch_name}}* (*{{course_name}}*). Regular attendance is essential for mastering the practical modules. Please connect with {{instructor_name}} at *{{institute_name}}* to catch up.',
    hi: 'प्रिय {{student_name}}, बैच *{{batch_name}}* (*{{course_name}}*) में आपकी लगातार अनुपस्थिति दर्ज हुई है। प्रैक्टिकल विषयों को समझने के लिए नियमित उपस्थिति आवश्यक है। कृपया *{{institute_name}}* में संपर्क करें।',
    mr: 'प्रिय {{student_name}}, बॅच *{{batch_name}}* (*{{course_name}}*) मध्ये आपली सलग गैरहजेरी नोंदवली गेली आहे. प्रॅक्टिकल अभ्यासक्रम समजण्यासाठी नियमित हजेरी आवश्यक आहे. कृपया *{{institute_name}}* शी संपर्क साधावा.'
  },
  {
    id: 'TPL-STU-03', category: 'Student Communication', scenario: 'General Student Support', tone: 'Friendly',
    title: '16. Fee Installment & Milestone Reminder',
    en: 'Hello {{student_name}}, this is an operational update from *{{institute_name}}* regarding your enrolled course *{{course_name}}* (Batch *{{batch_name}}*). Outstanding balance / installment: *{{fees}}*. Reach out anytime if you need payment assistance!',
    hi: 'नमस्ते {{student_name}}, *{{institute_name}}* से बैच *{{batch_name}}* (*{{course_name}}*) के लिए सहायता संदेश। शुल्क स्थिति: *{{fees}}*। किसी भी सहायता के लिए संपर्क करें!',
    mr: 'नमस्कार {{student_name}}, *{{institute_name}}* कडून बॅच *{{batch_name}}* (*{{course_name}}*) साठी सहाय्य संदेश. फी तपशील: *{{fees}}*. कोणत्याही मदतीसाठी नक्की कळवा!'
  },
  {
    id: 'TPL-STU-04', category: 'Student Communication', scenario: 'Course Completion', tone: 'Friendly',
    title: '17. Course Completion & Certificate Ready',
    en: 'Congratulations {{student_name}}! 🏆 You have successfully completed *{{course_name}}* (Batch *{{batch_name}}*) at *{{institute_name}}*. Your official Course Completion Certificate signed by {{instructor_name}} is ready for collection!',
    hi: 'बधाई हो {{student_name}}! 🏆 आपने *{{institute_name}}* से *{{course_name}}* (बैच *{{batch_name}}*) सफलतापूर्वक पूर्ण कर लिया है। आपका प्रमाणपत्र तैयार है!',
    mr: 'मनःपूर्वक अभिनंदन {{student_name}}! 🏆 आपण *{{institute_name}}* मधून *{{course_name}}* (बॅच *{{batch_name}}*) यशस्वीरीत्या पूर्ण केला आहे. आपले अधिकृत प्रमाणपत्र तयार आहे!'
  },

  // --- INSTITUTE ANNOUNCEMENTS ---
  {
    id: 'TPL-ANN-01', category: 'Institute Announcement', scenario: 'Daily Institute Update', tone: 'Professional',
    title: '18. Daily Institute Operations Update',
    en: '📢 *Daily Update — {{institute_name}} ({{lecture_date}})*\n• Batch: *{{batch_name}}* ({{course_name}})\n• Session Time: *{{lecture_time}}*\n• Faculty: {{instructor_name}}\nPlease bring your workbook and join on schedule.',
    hi: '📢 *दैनिक अपडेट — {{institute_name}} ({{lecture_date}})*\n• बैच: *{{batch_name}}* ({{course_name}})\n• समय: *{{lecture_time}}*\n• प्रशिक्षक: {{instructor_name}}\nकृपया समय पर उपस्थित रहें।',
    mr: '📢 *दैनिक अपडेट — {{institute_name}} ({{lecture_date}})*\n• बॅच: *{{batch_name}}* ({{course_name}})\n• वेळ: *{{lecture_time}}*\n• मार्गदर्शक: {{instructor_name}}\nकृपया वेळेवर उपस्थित रहावे.'
  },
  {
    id: 'TPL-ANN-02', category: 'Institute Announcement', scenario: 'Holiday & Reopening', tone: 'Friendly',
    title: '19. Institute Holiday & Campus Reopening Notice',
    en: '🏖️ *Holiday & Reopening Announcement — {{institute_name}}*\nOur campus will observe a holiday on *{{lecture_date}}* and reopen for all batches (*{{batch_name}}*) on *{{follow_up_date}}* at *{{lecture_time}}*.',
    hi: '🏖️ *अवकाश एवं पुनः प्रारंभ सूचना — {{institute_name}}*\nदिनांक *{{lecture_date}}* को संस्थान बंद रहेगा और *{{follow_up_date}}* ({{lecture_time}}) से सभी कक्षाएं नियमित चलेंगी।',
    mr: '🏖️ *सुट्टी आणि कामकाज पुन्हा सुरू होण्याबाबत सूचना — {{institute_name}}*\nदिनांक *{{lecture_date}}* रोजी इन्स्टिट्यूट बंद राहील आणि *{{follow_up_date}}* ({{lecture_time}}) पासून सर्व बॅचेस नियमित सुरू होतील.'
  }
];

export function getInitialAppState(): AppState {
  const today = LIVE_TODAY_ISO;
  return {
    schemaVersion: 5,
    lastSavedAt: new Date().toISOString(),
    lastManualBackupAt: null,
    lastCloudSyncAt: null,
    activeActor: 'Prasad Sir (Founder & Lead Educator)',
    excusedLeaveExcludedFromTotal: true,
    settings: {
      instituteName: 'Srujaan Share Market Institute Management System',
      shortName: 'SSMI',
      tagline: 'WHERE KNOWLEDGE MEETS PROFIT.',
      description: 'Specialized institutional price action, derivatives hedging, technical analysis, and professional capital management.',
      campusAddress: '',
      primaryAddress: {
        branchName: '',
        streetAddress: '',
        landmark: '',
        city: '',
        district: '',
        state: '',
        pincode: '',
        phone: '',
        whatsapp: '',
        googleMapsUrl: '',
        fullFormattedAddress: ''
      },
      landmark: '',
      city: '',
      state: '',
      district: '',
      pincode: '',
      branches: [],
      customBranchesInitialized: true,
      phone: '9823055667',
      whatsappSupport: '+91 98230 55667',
      email: 'srujaansharemarketpune@gmail.com',
      website: 'https://srujaantrading.edu.in',
      whatsappChannel: 'https://whatsapp.com/channel/srujaan-institute',
      youtube: 'https://youtube.com/@srujaantrading',
      instagram: 'https://instagram.com/srujaantrading',
      googleBusiness: '',
      googleMapsUrl: '',
      gstin: '27AABCS1429B1Z5',
      regNumber: 'MH-PUN-MSME-2024-88910',
      upiId: 'srujaaninstitute@icici',
      currencySymbol: '₹',
      receiptPrefix: 'SSMI-REC-2026-',
      receiptStartingNumber: 101,
      receiptTerms: 'Fees once paid are non-refundable and non-transferable under any circumstances. Official valid tax receipt for technical analysis & share market education.',
      bankName: 'ICICI Bank Ltd',
      bankAccountName: 'Srujaan Share Market Institute',
      bankAccountNumber: '003905012345',
      bankIfsc: 'ICIC0000039',
      certificateHeading: 'Certificate of Course Completion',
      certificateAuthorityText: 'This certifies that the candidate has successfully completed the curriculum in Technical Analysis, Derivatives Risk Management, Price Action, and Professional Trading Systems.',
      signatoryName: 'Prasad M Bhunje',
      signatoryDesignation: 'Founder & Lead Educator, Srujaan Share Market Institute',
      language: 'en',
      cloudDb: {
        provider: 'firebase',
        firebase: {
          projectId: 'new-project-ssmi',
          apiKey: '',
          appId: '1:296817342226:web:28b17a78b35cb9bc38e5cb'
        },
        lastSyncAt: null
      },
      appsScriptWebhookUrl: 'https://script.google.com/macros/s/AKfycbyATan9GQH5BVcHxPtWfp3rbQD4NWOcYpkGZK-lBde7NPc1c8lf4NU2xA8fsnIW2VljCg/exec',
      appsScriptEndpointMode: 'default',
      appsScriptLibraryId: '1INz8uaVBUBCxaOaZwS9x8jVcLUlZkIPYRKzDutBstXlwxAF3oLIxDh6J',
      appsScriptLibraryUrl: 'https://script.google.com/macros/library/d/1INz8uaVBUBCxaOaZwS9x8jVcLUlZkIPYRKzDutBstXlwxAF3oLIxDh6J/1',
      googleConnected: true
    },
    courses: [
      {
        id: 'CRS-01',
        code: 'CRS-01',
        name: 'Complete Master Trader Blueprint',
        fee: 45000,
        duration: '12 Weeks (60 Hours)',
        mode: 'Offline & Online',
        instructor: 'Prasad Sir',
        syllabus: 'Market Structure, Multi-Asset Price Action, Institutional Liquidity & Risk Management',
        status: 'Active',
        lectures: [
          {
            id: 'lec_1001',
            courseId: 'CRS-01',
            title: 'Multi-Timeframe Market Structure & BOS/CHoCH',
            module: 'Module 1: Institutional Market Structure',
            instructor: 'Prasad Sir',
            sessionType: 'Live Class',
            scheduledDateTime: `${today} 08:00 AM`,
            durationMins: 120,
            summaryOrLink: 'Identifying institutional swing highs/lows, break of structure (BOS), and change of character (CHoCH) on Nifty & top NSE stocks.',
            completed: true,
            batchCode: 'OCT-MTB-01'
          },
          {
            id: 'lec_1002',
            courseId: 'CRS-01',
            title: 'Order Blocks, Imbalance (FVG) & Liquidity Sweeps',
            module: 'Module 2: Institutional Liquidity',
            instructor: 'Prasad Sir',
            sessionType: 'Trading Lab',
            scheduledDateTime: `${today} 10:30 AM`,
            durationMins: 120,
            summaryOrLink: 'Live market scanner execution on NSE Cash & F&O stocks with strict 1:3 R:R risk rules.',
            completed: false,
            batchCode: 'OCT-MTB-01'
          },
          {
            id: 'lec_1003',
            courseId: 'CRS-01',
            title: 'Position Sizing, Drawdown Control & Trading Psychology',
            module: 'Module 3: Risk Architecture',
            instructor: 'Prasad Sir',
            sessionType: 'Recorded Video',
            scheduledDateTime: `${today} 04:00 PM`,
            durationMins: 90,
            summaryOrLink: 'Capital allocation framework, 1% max risk per trade rule, and weekly trade audit journal.',
            completed: false,
            batchCode: 'OCT-MTB-01'
          }
        ]
      },
      {
        id: 'CRS-02',
        code: 'CRS-02',
        name: 'Nifty / Bank Nifty F&O Masterclass',
        fee: 35000,
        duration: '8 Weeks (40 Hours)',
        mode: 'Offline Classroom',
        instructor: 'Prasad Sir',
        syllabus: 'Derivatives Fundamentals, Hedging Strategies, Volatility Control & Live Case Studies',
        status: 'Active',
        lectures: [
          {
            id: 'lec_2001',
            courseId: 'CRS-02',
            title: 'Options Greeks (Delta, Gamma, Theta, Vega) & IV Crush',
            module: 'Module 1: Derivatives Core',
            instructor: 'Prasad Sir',
            sessionType: 'Live Class',
            scheduledDateTime: `${today} 11:00 AM`,
            durationMins: 120,
            summaryOrLink: 'Practical Option Chain reading, PCR analysis, Max Pain, and strike selection for weekly expiry.',
            completed: true,
            batchCode: 'OCT-FO-01'
          },
          {
            id: 'lec_2002',
            courseId: 'CRS-02',
            title: 'Non-Directional Iron Condor, Credit Spreads & Adjustments',
            module: 'Module 2: Hedged F&O Strategies',
            instructor: 'Prasad Sir',
            sessionType: 'Trading Lab',
            scheduledDateTime: `${today} 06:30 PM`,
            durationMins: 120,
            summaryOrLink: 'Deploying delta-neutral hedged spreads with fire-fighting intraday adjustment rules.',
            completed: false,
            batchCode: 'OCT-FO-02'
          }
        ]
      },
      {
        id: 'CRS-03',
        code: 'CRS-03',
        name: 'Indian Equity & Price Action Foundation',
        fee: 25000,
        duration: '6 Weeks (30 Hours)',
        mode: 'Offline & Online',
        instructor: 'Prasad Sir',
        syllabus: 'Candlestick Psychology, Demand-Supply Zones, Swing Portfolio Allocation',
        status: 'Active',
        lectures: [
          {
            id: 'lec_3001',
            courseId: 'CRS-03',
            title: 'Candlestick Anatomy, Volume Spread & Demand-Supply Zones',
            module: 'Module 1: Price Action Basics',
            instructor: 'Prasad Sir',
            sessionType: 'Live Class',
            scheduledDateTime: `${today} 09:00 AM`,
            durationMins: 120,
            summaryOrLink: 'Fresh zone marking (Rally-Base-Rally, Drop-Base-Rally) for high-probability swing trades.',
            completed: true,
            batchCode: 'WKND-PA-04'
          }
        ]
      },
      {
        id: 'CRS-04',
        code: 'CRS-04',
        name: 'Global Currency & Forex Trading',
        fee: 30000,
        duration: '6 Weeks (30 Hours)',
        mode: 'Online Live',
        instructor: 'Prasad Sir',
        syllabus: 'Macro Currency Correlations, London/NY Session Timing & Risk Discipline',
        status: 'Active',
        lectures: []
      },
      {
        id: 'CRS-05',
        code: 'CRS-05',
        name: 'Crypto Asset Trading & Risk Systems',
        fee: 28000,
        duration: '6 Weeks (24 Hours)',
        mode: 'Online Live',
        instructor: 'Prasad Sir',
        syllabus: 'Digital Asset Market Cycles, Custody Safety & Position Risk Controls',
        status: 'Active',
        lectures: []
      }
    ],
    batches: [
      {
        code: 'OCT-MTB-01',
        name: 'Morning Master Blueprint Batch',
        course: 'Complete Master Trader Blueprint',
        mode: 'Offline Classroom',
        instructor: 'Prasad Sir',
        schedule: 'Mon–Fri • 08:00 AM - 10:00 AM',
        startDate: '2026-09-15',
        endDate: '2026-12-10',
        capacity: 25,
        status: 'Active'
      },
      {
        code: 'OCT-FO-01',
        name: 'Weekday F&O Practical Batch',
        course: 'Nifty / Bank Nifty F&O Masterclass',
        mode: 'Offline Classroom',
        instructor: 'Prasad Sir',
        schedule: 'Mon–Fri • 10:30 AM - 12:30 PM',
        startDate: '2026-10-08',
        endDate: '2026-12-05',
        capacity: 25,
        status: 'Active'
      },
      {
        code: 'OCT-FO-02',
        name: 'Evening F&O Live Batch',
        course: 'Nifty / Bank Nifty F&O Masterclass',
        mode: 'Online Live',
        instructor: 'Prasad Sir',
        schedule: 'Mon–Fri • 07:00 PM - 08:30 PM',
        startDate: '2026-10-01',
        endDate: '2026-11-28',
        capacity: 30,
        status: 'Active'
      },
      {
        code: 'WKND-PA-04',
        name: 'Weekend Price Action Executive Batch',
        course: 'Indian Equity & Price Action Foundation',
        mode: 'Hybrid',
        instructor: 'Prasad Sir',
        schedule: 'Sat & Sun • 10:00 AM - 01:00 PM',
        startDate: '2026-10-05',
        endDate: '2026-11-22',
        capacity: 30,
        status: 'Active'
      }
    ],
    lectures: [
      { id: 'LEC-01', batchCode: 'OCT-MTB-01', date: today, time: '08:00 AM - 10:00 AM', topic: 'Multi-Timeframe Demand & Supply Zones', instructor: 'Prasad Sir', status: 'Completed' },
      { id: 'LEC-02', batchCode: 'OCT-FO-01', date: today, time: '10:30 AM - 12:30 PM', topic: 'Hedging & Payoff Graph Construction', instructor: 'Prasad Sir', status: 'Completed' },
      { id: 'LEC-03', batchCode: 'OCT-FO-02', date: today, time: '07:00 PM - 08:30 PM', topic: 'Volatility Regimes & Risk Protection', instructor: 'Prasad Sir', status: 'Scheduled' },
      { id: 'LEC-04', batchCode: 'WKND-PA-04', date: today, time: '10:00 AM - 01:00 PM', topic: 'Swing Portfolio Entry Checklist', instructor: 'Prasad Sir', status: 'Scheduled' }
    ],
    students: [
      {
        id: 'STU-201',
        regId: 'SSMI-2026-001',
        name: 'Omkar Nimbalkar',
        phone: '9823199001',
        whatsapp: '+919823199001',
        email: 'omkar.n@gmail.com',
        address: 'Shivajinagar, Pune',
        course: 'Complete Master Trader Blueprint',
        batch: 'OCT-MTB-01',
        enrollDate: '2026-09-15',
        joinDate: '2026-09-16',
        status: 'Active',
        source: 'Walk-in Counseling',
        grossFee: 50000,
        discount: 5000,
        netFee: 45000,
        docs: 'Aadhaar & PAN Verified, Form #101',
        notes: 'Consistent attendance; completing practical workbook assignments on schedule.',
        milestones: [
          { name: 'Admission Token Deposit', amount: 15000, dueDate: '2026-09-15', status: 'Paid', paymentDate: '2026-09-15', mode: 'UPI', ref: 'UPI625819902341' },
          { name: 'Module 2 Practical Stage', amount: 15000, dueDate: '2026-10-05', status: 'Paid', paymentDate: '2026-10-04', mode: 'Bank Transfer / NEFT', ref: 'HDFCN2627789120' },
          { name: 'Final Certification Installment', amount: 15000, dueDate: '2026-10-10', status: 'Overdue', paymentDate: '', mode: 'UPI', ref: '' }
        ]
      },
      {
        id: 'STU-202',
        regId: 'SSMI-2026-002',
        name: 'Rutuja Gokhale',
        phone: '9766100228',
        whatsapp: '+919766100228',
        email: 'rutuja.gokhale@gmail.com',
        address: 'Kothrud, Pune',
        course: 'Nifty / Bank Nifty F&O Masterclass',
        batch: 'OCT-FO-02',
        enrollDate: '2026-10-01',
        joinDate: '2026-10-01',
        status: 'Active',
        source: 'Instagram / Meta',
        grossFee: 30000,
        discount: 2000,
        netFee: 28000,
        docs: 'Aadhaar Verified, Form #102',
        notes: 'Working professional in evening online batch; missed recent sessions due to office travel.',
        milestones: [
          { name: 'Admission Token Deposit', amount: 14000, dueDate: '2026-10-01', status: 'Paid', paymentDate: '2026-10-01', mode: 'UPI', ref: 'UPI627490011223' },
          { name: 'Second Installment', amount: 14000, dueDate: '2026-10-12', status: 'Overdue', paymentDate: '', mode: 'UPI', ref: '' }
        ]
      },
      {
        id: 'STU-203',
        regId: 'SSMI-2026-003',
        name: 'Kedar Bhosale',
        phone: '9890177665',
        whatsapp: '+919890177665',
        email: 'kedar.trades@gmail.com',
        address: 'Deccan Gymkhana, Pune',
        course: 'Indian Equity & Price Action Foundation',
        batch: 'WKND-PA-04',
        enrollDate: '2026-10-08',
        joinDate: '2026-10-10',
        status: 'Active',
        source: 'Student Referral',
        grossFee: 25000,
        discount: 5000,
        netFee: 20000,
        docs: 'Aadhaar & College ID, Form #103',
        notes: 'Full single-shot fee settled on admission.',
        milestones: [
          { name: 'Full Single-Shot Settlement', amount: 20000, dueDate: '2026-10-08', status: 'Paid', paymentDate: '2026-10-08', mode: 'Card', ref: 'POS883920192' }
        ]
      },
      {
        id: 'STU-101',
        regId: 'SSMI-2026-004',
        name: 'Rohan More',
        phone: '9823114477',
        whatsapp: '+919823114477',
        email: 'rohan.more@gmail.com',
        address: 'FC Road, Pune',
        course: 'Nifty / Bank Nifty F&O Masterclass',
        batch: 'OCT-FO-01',
        enrollDate: '2026-10-08',
        joinDate: '2026-10-08',
        status: 'Active',
        source: 'Walk-in Counseling',
        grossFee: 35000,
        discount: 0,
        netFee: 35000,
        docs: 'Aadhaar Verified, Form #104',
        notes: 'Enrolled in morning practical batch.',
        milestones: [
          { name: 'Registration Token', amount: 10000, dueDate: '2026-10-08', status: 'Paid', paymentDate: '2026-10-08', mode: 'UPI', ref: 'UPI4289018491' },
          { name: 'Module 2 Installment', amount: 15000, dueDate: '2026-10-14', status: 'Overdue', paymentDate: '', mode: 'UPI', ref: '' },
          { name: 'Final Certification Stage', amount: 10000, dueDate: '2026-11-10', status: 'Pending', paymentDate: '', mode: 'UPI', ref: '' }
        ]
      },
      {
        id: 'STU-102',
        regId: 'SSMI-2026-005',
        name: 'Sneha Kadam',
        phone: '9970884411',
        whatsapp: '+919970884411',
        email: 'sneha.kadam@gmail.com',
        address: 'Karve Nagar, Pune',
        course: 'Indian Equity & Price Action Foundation',
        batch: 'WKND-PA-04',
        enrollDate: '2026-10-05',
        joinDate: '2026-10-05',
        status: 'Active',
        source: 'Google Search / Maps',
        grossFee: 25000,
        discount: 0,
        netFee: 25000,
        docs: 'PAN Verified, Form #105',
        notes: '100% fee cleared via NEFT.',
        milestones: [
          { name: 'Full Clearance Fee', amount: 25000, dueDate: '2026-10-05', status: 'Paid', paymentDate: '2026-10-05', mode: 'Bank Transfer / NEFT', ref: 'NEFT83902911' }
        ]
      },
      {
        id: 'STU-103',
        regId: 'SSMI-2026-006',
        name: 'Abhishek Gaikwad',
        phone: '9860332211',
        whatsapp: '+919860332211',
        email: 'abhi.gaikwad@gmail.com',
        address: 'Aundh, Pune',
        course: 'Complete Master Trader Blueprint',
        batch: 'OCT-FO-01',
        enrollDate: '2026-10-12',
        joinDate: '2026-10-12',
        status: 'Active',
        source: 'Demo Seminar',
        grossFee: 45000,
        discount: 0,
        netFee: 45000,
        docs: 'Aadhaar Copy, Form #106',
        notes: 'Enrolled in morning F&O batch; installment due soon.',
        milestones: [
          { name: 'Initial Admission Token', amount: 15000, dueDate: '2026-10-12', status: 'Paid', paymentDate: '2026-10-12', mode: 'Cash', ref: 'CASH-REC-01' },
          { name: 'Second Installment', amount: 15000, dueDate: '2026-11-05', status: 'Pending', paymentDate: '', mode: 'UPI', ref: '' },
          { name: 'Final Installment', amount: 15000, dueDate: '2026-11-25', status: 'Pending', paymentDate: '', mode: 'UPI', ref: '' }
        ]
      },
      {
        id: 'STU-204',
        regId: 'SSMI-2026-007',
        name: 'Tanmay Deshmukh',
        phone: '9822909011',
        whatsapp: '+919822909011',
        email: 'tanmay.d@gmail.com',
        address: 'Baner, Pune',
        course: 'Indian Equity & Price Action Foundation',
        batch: '', // Unassigned demo
        enrollDate: today,
        joinDate: '',
        status: 'Active',
        source: 'WhatsApp Enquiry',
        grossFee: 25000,
        discount: 2000,
        netFee: 23000,
        docs: 'Admission Token Verified',
        notes: 'Newly admitted; awaiting batch allocation (prefers Weekend or Morning batch).',
        milestones: [
          { name: 'Admission Token', amount: 10000, dueDate: today, status: 'Paid', paymentDate: today, mode: 'UPI', ref: 'UPI998811223' },
          { name: 'Balance Installment', amount: 13000, dueDate: '2026-11-15', status: 'Pending', paymentDate: '', mode: 'UPI', ref: '' }
        ]
      }
    ],
    leads: [
      {
        id: 'LEAD-101', name: 'Aarav Kulkarni', phone: '9822011445', email: 'aarav.kulkarni@gmail.com',
        locality: 'Kothrud, Pune', course: 'Nifty / Bank Nifty F&O Masterclass', stage: 'Demo Scheduled',
        intent: 'Hot', enquiryDate: '2026-10-14', followUpDate: today, followUpTime: '17:30', lastContact: '2026-10-15',
        source: 'Instagram / Meta Ads', mode: 'Offline', staff: 'Anjali Deshmukh',
        objection: 'Needs structured risk management rules',
        notes: 'Scheduled for counseling & live classroom demo today at 5:30 PM.'
      },
      {
        id: 'LEAD-102', name: 'Snehal Joshi', phone: '9765422110', email: 'snehal.joshi@outlook.com',
        locality: 'Wakad, PCMC', course: 'Indian Equity & Price Action Foundation', stage: 'Follow-up Required',
        intent: 'Hot', enquiryDate: '2026-10-10', followUpDate: '2026-10-14', followUpTime: '11:00', lastContact: '2026-10-14',
        source: 'Google Search / Maps', mode: 'Hybrid', staff: 'Anjali Deshmukh',
        objection: 'Absolute Beginner (Wants step-by-step assurance)',
        notes: 'IT Analyst at Hinjewadi. Wants systematic weekend swing trading batch.'
      },
      {
        id: 'LEAD-103', name: 'Prathamesh Shinde', phone: '9850033441', email: 'prathamesh.fx@gmail.com',
        locality: 'Viman Nagar, Pune', course: 'Global Currency & Forex Trading', stage: 'Interested',
        intent: 'Warm', enquiryDate: '2026-10-12', followUpDate: '2026-11-02', followUpTime: '18:30', lastContact: '2026-10-15',
        source: 'WhatsApp', mode: 'Online', staff: 'Prasad Sir',
        objection: 'Job Clash (Needs Evening / Weekend Batch)',
        notes: 'Works UK shift. Interested in evening online batch.'
      },
      {
        id: 'LEAD-104', name: 'Mayank Deshpande', phone: '9923144556', email: 'mayank.crypto@yahoo.com',
        locality: 'Baner, Pune', course: 'Crypto Asset Trading & Risk Systems', stage: 'Contacted',
        intent: 'Warm', enquiryDate: '2026-10-13', followUpDate: today, followUpTime: '15:00', lastContact: '2026-10-15',
        source: 'Instagram / Meta Ads', mode: 'Online', staff: 'Anjali Deshmukh',
        objection: 'Fees Considered Expensive (Requested 3 installments)',
        notes: 'Requested 3-stage milestone installment plan.'
      },
      {
        id: 'LEAD-105', name: 'Gauri Patwardhan', phone: '9881122339', email: 'gauri.p@gmail.com',
        locality: 'Deccan Gymkhana, Pune', course: 'Complete Master Trader Blueprint', stage: 'New Enquiry',
        intent: 'Hot', enquiryDate: today, followUpDate: today, followUpTime: '19:00', lastContact: today,
        source: 'Walk-in', mode: 'Offline', staff: 'Prasad Sir',
        objection: 'Wants to speak to the instructor',
        notes: 'Enquired for complete multi-asset institutional mentorship.'
      },
      {
        id: 'LEAD-106', name: 'Amol Deshmukh', phone: '9822114455', email: 'amol.d@gmail.com',
        locality: 'Kothrud, Pune', course: 'Nifty / Bank Nifty F&O Masterclass', stage: 'Demo Attended',
        intent: 'Hot', enquiryDate: '2026-10-11', followUpDate: today, followUpTime: '12:00', lastContact: '2026-10-16',
        source: 'Demo Workshop', mode: 'Offline', staff: 'Prasad Sir',
        objection: 'Wants to consult family before paying token',
        notes: 'Attended demo session; following up today for admission.'
      },
      {
        id: 'LEAD-107', name: 'Pooja Jadhav', phone: '9766554433', email: 'pooja.j@outlook.com',
        locality: 'Hadapsar, Pune', course: 'Indian Equity & Price Action Foundation', stage: 'New Enquiry',
        intent: 'Warm', enquiryDate: '2026-10-15', followUpDate: today, followUpTime: '16:00', lastContact: '2026-10-15',
        source: 'Google Search / Maps', mode: 'Hybrid', staff: 'Anjali Deshmukh',
        objection: 'Beginner Suitability',
        notes: 'Software engineer wanting weekend foundation course.'
      },
      {
        id: 'LEAD-108', name: 'Sagar Shinde', phone: '9422009988', email: 'sagar.trade@yahoo.com',
        locality: 'Pimpri-Chinchwad', course: 'Complete Master Trader Blueprint', stage: 'Demo Scheduled',
        intent: 'Hot', enquiryDate: '2026-10-14', followUpDate: today, followUpTime: '16:00', lastContact: '2026-10-15',
        source: 'Student Referral', mode: 'Offline', staff: 'Prasad Sir',
        objection: 'Fee Constraints (Requires Installments)',
        notes: 'Visiting Pune campus today.'
      },
      {
        id: 'LEAD-109', name: 'Vikram Kulkarni', phone: '9158001144', email: 'vikram.k@gmail.com',
        locality: 'Wakad, Pune', course: 'Global Currency & Forex Trading', stage: 'Future Follow-up',
        intent: 'Cold', enquiryDate: '2026-10-09', followUpDate: '2026-11-10', followUpTime: '18:00', lastContact: '2026-10-12',
        source: 'WhatsApp', mode: 'Online', staff: 'Anjali Deshmukh',
        objection: 'Wants to join next month batch',
        notes: 'Works in US shift; wants next month weekend batch.'
      },
      {
        id: 'LEAD-110', name: 'Mahesh Patil', phone: '9890112233', email: 'patil.mahesh@rediffmail.com',
        locality: 'Shivajinagar, Pune', course: 'Complete Master Trader Blueprint', stage: 'Admission Confirmed',
        intent: 'Hot', enquiryDate: '2026-10-10', followUpDate: '2026-10-15', followUpTime: '18:00', lastContact: '2026-10-15',
        source: 'Walk-in', mode: 'Offline', staff: 'Prasad Sir',
        objection: 'None — Token Paid',
        notes: 'Paid token deposit. Ready for batch enrollment.'
      }
    ],
    attendance: {
      'OCT-MTB-01_2026-10-15': {
        sessionStatus: 'Completed',
        topic: 'Institutional Market Structure BOS & CHoCH',
        records: {
          'STU-201': { status: 'Present', note: 'On time' }
        }
      },
      [`OCT-MTB-01_${today}`]: {
        sessionStatus: 'Completed',
        topic: 'Multi-Timeframe Demand & Supply Zones',
        records: {
          'STU-201': { status: 'Present', note: 'Completed workbook' }
        }
      },
      'OCT-FO-01_2026-10-14': {
        sessionStatus: 'Completed',
        topic: 'Options Chain & Open Interest Basics',
        records: {
          'STU-101': { status: 'Present', note: '' },
          'STU-103': { status: 'Absent', note: 'Personal work' }
        }
      },
      'OCT-FO-01_2026-10-15': {
        sessionStatus: 'Completed',
        topic: 'Volatility & Option Pricing',
        records: {
          'STU-101': { status: 'Present', note: '' },
          'STU-103': { status: 'Absent', note: 'Uninformed absence' }
        }
      },
      [`OCT-FO-01_${today}`]: {
        sessionStatus: 'Completed',
        topic: 'Hedging & Payoff Graph Construction',
        records: {
          'STU-101': { status: 'Present', note: '' },
          'STU-103': { status: 'Late', note: 'Joined 15 mins late' }
        }
      },
      'OCT-FO-02_2026-10-14': {
        sessionStatus: 'Completed',
        topic: 'Evening Live Derivatives Setup',
        records: {
          'STU-202': { status: 'Absent', note: 'Office meeting' }
        }
      },
      'OCT-FO-02_2026-10-15': {
        sessionStatus: 'Completed',
        topic: 'Credit Spread Risk Management',
        records: {
          'STU-202': { status: 'Absent', note: 'Consecutive absence #2' }
        }
      },
      [`OCT-FO-02_${today}`]: {
        sessionStatus: 'Completed',
        topic: 'Volatility Regimes & Risk Protection',
        records: {
          'STU-202': { status: 'Absent', note: 'Needs counselor follow-up' }
        }
      },
      'WKND-PA-04_2026-10-11': {
        sessionStatus: 'Completed',
        topic: 'Candlestick Anatomy & Volume Confirmation',
        records: {
          'STU-203': { status: 'Present', note: '' },
          'STU-102': { status: 'Present', note: '' }
        }
      },
      [`WKND-PA-04_${today}`]: {
        sessionStatus: 'Completed',
        topic: 'Swing Portfolio Entry Checklist',
        records: {
          'STU-203': { status: 'Present', note: '' },
          'STU-102': { status: 'Excused Leave', note: 'Approved family event leave' }
        }
      }
    },
    attendanceHistory: [
      {
        id: 'ATTH-01',
        timestamp: '2026-10-16 11:10:00',
        studentId: 'STU-103',
        studentName: 'Abhishek Gaikwad',
        batchCode: 'OCT-FO-01',
        date: today,
        oldStatus: 'Absent',
        newStatus: 'Late',
        actor: 'Prasad Sir (Instructor)',
        note: 'Arrived 15 minutes after roll call'
      }
    ],
    templates: DEFAULT_WHATSAPP_PRESETS,
    dailyQueue: [
      {
        id: 'DQ-101',
        date: today,
        recipientType: 'Student',
        recipientId: 'STU-202',
        recipientName: 'Rutuja Gokhale',
        phone: '+919766100228',
        batchCode: 'OCT-FO-02',
        scenario: 'Consecutive Absences',
        message: 'Dear Rutuja Gokhale, our attendance register shows consecutive absences in Batch *OCT-FO-02* (*Nifty / Bank Nifty F&O Masterclass*). Regular attendance is essential for mastering the practical modules. Please connect with Prasad Sir at *Srujaan Share Market Institute* to catch up.',
        status: 'Prepared',
        updatedAt: '2026-10-17 08:15:00'
      },
      {
        id: 'DQ-102',
        date: today,
        recipientType: 'Lead',
        recipientId: 'LEAD-101',
        recipientName: 'Aarav Kulkarni',
        phone: '+919822011445',
        batchCode: 'OCT-FO-01',
        scenario: 'Demo Confirmation',
        message: `Confirmed! ✅ Hi Aarav Kulkarni, your demo session for *Nifty / Bank Nifty F&O Masterclass* at *Srujaan Share Market Institute* is confirmed for *${today}* at *17:30*. Please bring a notebook. See you soon!`,
        status: 'Chat Opened',
        updatedAt: '2026-10-17 08:20:00'
      }
    ],
    communications: [
      {
        id: 'COM-01',
        timestamp: '2026-10-16 18:05:00',
        recipientType: 'Lead',
        recipientId: 'LEAD-101',
        recipientName: 'Aarav Kulkarni',
        phone: '+919822011445',
        scenario: 'Demo Invitation',
        status: 'Marked Sent',
        message: 'Invited Aarav Kulkarni for Demo & Counseling session at FC Road Pune campus.'
      },
      {
        id: 'COM-02',
        timestamp: '2026-10-16 19:15:00',
        recipientType: 'Student',
        recipientId: 'STU-201',
        recipientName: 'Omkar Nimbalkar',
        phone: '+919823199001',
        scenario: 'General Student Support',
        status: 'Chat Opened',
        message: 'Sent installment reminder for Final Certification stage (₹15,000).'
      }
    ],
    certificates: [
      {
        id: 'CERT-SSMI-2026-001',
        studentId: 'STU-203',
        studentName: 'Kedar Bhosale',
        regId: 'SSMI-2026-003',
        course: 'Indian Equity & Price Action Foundation',
        batchCode: 'WKND-PA-04',
        issueDate: '2026-10-15',
        grade: 'Distinction (Verified)',
        issuedBy: 'Prasad M Bhunje'
      }
    ],
    staff: [
      {
        id: 'STF-01',
        name: 'Prasad Sir',
        role: 'Founder & Lead Educator',
        phone: '9823055667',
        email: 'prasad@srujaantrading.edu.in',
        salary: 120000,
        joiningDate: '2023-01-15',
        batches: 'OCT-MTB-01, OCT-FO-01, OCT-FO-02, WKND-PA-04',
        status: 'Active'
      },
      {
        id: 'STF-03',
        name: 'Anjali Deshmukh',
        role: 'Front Desk / Admissions Counselor',
        phone: '9765001199',
        email: 'admissions@srujaantrading.edu.in',
        salary: 45000,
        joiningDate: '2024-03-10',
        batches: 'All Enquiries & Demo Desk',
        status: 'Active'
      }
    ],
    materials: [
      {
        id: 'mat_101',
        title: 'Price Action Trading Guide & Demand-Supply Handbook.pdf',
        courseId: 'CRS-01',
        course: 'Complete Master Trader Blueprint',
        fileType: 'PDF',
        type: 'PDF Guide / Workbook',
        fileSize: '2.4 MB',
        fileName: 'Price_Action_Trading_Guide_SSMI.txt',
        fileData: 'data:text/plain;charset=utf-8,' + encodeURIComponent(
          'SRUJAAN SHARE MARKET INSTITUTE (PUNE)\n' +
          '====================================================\n' +
          'STUDY MATERIAL: COMPLETE PRICE ACTION TRADING GUIDE & DEMAND-SUPPLY HANDBOOK\n' +
          'Course: Complete Master Trader Blueprint (CRS-01)\n' +
          'Author: Prasad Sir (Founder & Lead Educator, Srujaan Share Market Institute)\n\n' +
          '1. MARKET STRUCTURE FUNDAMENTALS\n' +
          '- Uptrend: Higher Highs (HH) and Higher Lows (HL)\n' +
          '- Downtrend: Lower Highs (LH) and Lower Lows (LL)\n' +
          '- BOS (Break of Structure): Continuation signal in trend direction.\n' +
          '- CHoCH (Change of Character): First institutional sign of trend reversal.\n\n' +
          '2. HIGH-PROBABILITY DEMAND & SUPPLY ZONES\n' +
          '- RBR (Rally-Base-Rally): Continuation Demand Zone\n' +
          '- DBR (Drop-Base-Rally): Reversal Demand Zone\n' +
          '- DBD (Drop-Base-Drop): Continuation Supply Zone\n' +
          '- RBD (Rally-Base-Drop): Reversal Supply Zone\n\n' +
          '3. GOLDEN RISK MANAGEMENT RULES\n' +
          '- Never risk more than 1% of total trading capital on a single setup.\n' +
          '- Minimum Risk-to-Reward Ratio: 1:2.5 on swing setups, 1:2 on intraday.\n' +
          '- Mandatory Stop-Loss in system before order execution.\n'
        ),
        uploadDate: today,
        batchAccess: 'All Batches',
        summary: 'Covers multi-timeframe market structure, BOS/CHoCH identification, institutional demand-supply zones, and liquidity sweep checklists.'
      },
      {
        id: 'mat_102',
        title: 'Risk Management Rules & Options Hedging Manual.pdf',
        courseId: 'CRS-02',
        course: 'Nifty / Bank Nifty F&O Masterclass',
        fileType: 'PDF',
        type: 'Reference Sheet',
        fileSize: '1.8 MB',
        fileName: 'Risk_Management_And_Options_Hedging_SSMI.txt',
        fileData: 'data:text/plain;charset=utf-8,' + encodeURIComponent(
          'SRUJAAN SHARE MARKET INSTITUTE (PUNE)\n' +
          '====================================================\n' +
          'STUDY MATERIAL: RISK MANAGEMENT RULES & OPTIONS HEDGING REFERENCE MANUAL\n' +
          'Course: Nifty / Bank Nifty F&O Masterclass (CRS-02)\n' +
          'Faculty: Prasad Sir (Founder & Lead Educator, Srujaan Share Market Institute)\n\n' +
          '1. OPTIONS GREEKS CHECKLIST\n' +
          '- Delta: Directional exposure per 1-point move in Nifty/Bank Nifty.\n' +
          '- Theta: Time decay curve (accelerates post Tuesday afternoon).\n' +
          '- Vega: Implied Volatility (IV) sensitivity—avoid naked buying when India VIX > 18.\n\n' +
          '2. CORE HEDGED STRATEGIES\n' +
          '- Bull Call Spread / Bear Put Spread for directional trends.\n' +
          '- Iron Condor & Iron Butterfly for range-bound sessions.\n' +
          '- Max intraday drawdown limit: 1.5% of deployed margin.\n'
        ),
        uploadDate: today,
        batchAccess: 'OCT-FO-01',
        summary: 'Step-by-step hedging structures, margin discipline, Options Greeks rules, and weekly expiry risk control rules.'
      },
      {
        id: 'mat_103',
        title: 'Swing Trader Pre-Market & Post-Market Audit Journal.docx',
        courseId: 'CRS-03',
        course: 'Indian Equity & Price Action Foundation',
        fileType: 'DOCX',
        type: 'Lecture Checklist',
        fileSize: '840 KB',
        fileName: 'Swing_Trader_Audit_Checklist_SSMI.txt',
        fileData: 'data:text/plain;charset=utf-8,' + encodeURIComponent(
          'SRUJAAN SHARE MARKET INSTITUTE (PUNE)\n' +
          '====================================================\n' +
          'DAILY 10-POINT SWING TRADER PRE-MARKET & POST-MARKET AUDIT JOURNAL\n' +
          'Course: Indian Equity & Price Action Foundation (CRS-03)\n\n' +
          '[ ] 1. Check Nifty 50 & Sectoral Index trend alignment.\n' +
          '[ ] 2. Mark Weekly & Daily fresh Demand/Supply zones.\n' +
          '[ ] 3. Verify Relative Volume (>1.5x 20-day average) on breakout candle.\n' +
          '[ ] 4. Confirm no major corporate earnings/event risk within 48 hours.\n' +
          '[ ] 5. Calculate exact position size based on 1% capital risk.\n'
        ),
        uploadDate: today,
        batchAccess: 'All Batches',
        summary: 'Daily 10-point checklist for selecting high-probability NSE equity swing setups and logging trade discipline.'
      }
    ],
    mediaLibrary: [
      {
        id: 'MED-01',
        title: 'Srujaan Institute Master Prospectus & Curriculum Guide (2026-27)',
        category: 'Brochure',
        mimeType: 'application/pdf',
        sizeStr: '2.4 MB',
        uploadDate: today,
        summary: 'Comprehensive 12-week & 8-week curriculum overview with course modules, faculty credentials, and milestone fee schedules.'
      },
      {
        id: 'MED-02',
        title: 'Nifty & Bank Nifty F&O Hedging & Payoff Reference Manual',
        category: 'Syllabus',
        mimeType: 'application/pdf',
        sizeStr: '1.8 MB',
        uploadDate: today,
        summary: 'Options payoff graphs, multi-strike margin tables, delta-neutral hedging rules, and weekly risk control checklists.'
      },
      {
        id: 'MED-03',
        title: 'October Weekend Price Action Batch Launch Flyer',
        category: 'Poster',
        mimeType: 'image/png',
        sizeStr: '950 KB',
        uploadDate: today,
        summary: 'Official promotional poster for upcoming executive weekend trading batch at FC Road Pune Campus.'
      },
      {
        id: 'MED-04',
        title: 'Standard Student Admission Agreement & Demat Verification Form',
        category: 'Admission',
        mimeType: 'application/pdf',
        sizeStr: '620 KB',
        uploadDate: today,
        summary: 'Official code of conduct, risk disclosure notice, fee milestone terms, and partner broker verification sheet.'
      }
    ],
    auditLogs: [
      {
        id: 'AUD-1001',
        timestamp: '2026-10-17 08:00:00',
        category: 'Backup/Sync',
        action: 'Consolidated State Hydration',
        recordId: 'SYSTEM_BOOT',
        actor: 'Auto-Initializer',
        details: 'Loaded 7 students, 10 leads, 4 batches, 5 courses, and 46 trilingual presets into local IndexedDB.'
      }
    ],
    syncQueue: [
      {
        id: 'SYNC-01',
        timestamp: '2026-10-17 08:05:00',
        module: 'Students',
        operation: 'UPSERT_BATCH',
        summary: '7 Student Records & Fee Milestones ready for Cloud Database sync',
        status: 'Pending (Offline Queue)'
      }
    ]
  };
}
