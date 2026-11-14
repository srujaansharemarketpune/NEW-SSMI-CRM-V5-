import React, { useState } from 'react';
import { AppState, Certificate } from '../types';
import { Award, Printer } from 'lucide-react';
import { getActiveInstituteAddress } from '../services/db';

interface CertificatesViewProps {
  state: AppState;
  onIssueCertificate: (cert: Certificate) => void;
  onPrintCertificate: (cert: Certificate) => void;
}

export const CertificatesView: React.FC<CertificatesViewProps> = ({
  state,
  onIssueCertificate,
  onPrintCertificate
}) => {
  const [selectedStudentId, setSelectedStudentId] = useState<string>(state.students[0]?.id || '');
  const [courseInput, setCourseInput] = useState<string>(state.students[0]?.course || '');
  const [gradeInput, setGradeInput] = useState<string>('Distinction (Verified)');
  const [issueDateInput, setIssueDateInput] = useState<string>(new Date().toISOString().split('T')[0]);
  const [certIdInput, setCertIdInput] = useState<string>(
    `CERT-SSMI-${new Date().getFullYear()}-${String(state.certificates.length + 1).padStart(3, '0')}`
  );

  const selectedStudent = state.students.find(s => s.id === selectedStudentId) || state.students[0];

  const handleStudentSelect = (id: string) => {
    setSelectedStudentId(id);
    const stu = state.students.find(s => s.id === id);
    if (stu) {
      setCourseInput(stu.course);
    }
  };

  const OFFICIAL_SIGNATORY_NAME = 'Prasad M Bhunje';
  const OFFICIAL_SIGNATORY_TITLE = 'Founder & Lead Educator, Srujaan Share Market Institute';

  const handleIssue = () => {
    if (!selectedStudent) return;
    const cert: Certificate = {
      id: certIdInput,
      studentId: selectedStudent.id,
      studentName: selectedStudent.name,
      regId: selectedStudent.regId,
      course: courseInput,
      batchCode: selectedStudent.batch || 'Classroom',
      issueDate: issueDateInput,
      grade: gradeInput,
      issuedBy: OFFICIAL_SIGNATORY_NAME
    };
    onIssueCertificate(cert);
  };

  const currentPreviewCert: Certificate = {
    id: certIdInput,
    studentId: selectedStudent?.id || '',
    studentName: selectedStudent?.name || 'Student Name',
    regId: selectedStudent?.regId || 'SSMI-2026-001',
    course: courseInput || 'Complete Master Trader Blueprint',
    batchCode: selectedStudent?.batch || 'OCT-MTB-01',
    issueDate: issueDateInput,
    grade: gradeInput,
    issuedBy: OFFICIAL_SIGNATORY_NAME
  };

  return (
    <div className="space-y-4">
      {/* Title Bar */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h2 className="text-lg font-black text-slate-900 tracking-tight">
              Course Completion Certificates & Issuance Ledger
            </h2>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-purple-50 text-purple-700 border border-purple-200 font-mono-code">
              {state.certificates.length} Issued
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1 font-medium">
            Unique verifiable serial identifiers, duplicate prevention guard, and printable A4 landscape certificates
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Left: Certificate Generator Controls & History */}
        <div className="space-y-4">
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-4">
            <h3 className="text-sm font-extrabold text-slate-900 pb-2 border-b border-slate-100">
              Issue New Course Certificate
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                  Select Enrolled Student
                </label>
                <select
                  value={selectedStudentId}
                  onChange={(e) => handleStudentSelect(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-900 focus:outline-none focus:border-blue-500 font-medium"
                >
                  {state.students.map(s => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.regId})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                  Course Title
                </label>
                <input
                  type="text"
                  value={courseInput}
                  onChange={(e) => setCourseInput(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-900 font-medium"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                  Issue Date
                </label>
                <input
                  type="date"
                  value={issueDateInput}
                  onChange={(e) => setIssueDateInput(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-900 font-mono-code font-medium"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                  Certificate Serial ID
                </label>
                <input
                  type="text"
                  value={certIdInput}
                  onChange={(e) => setCertIdInput(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-900 font-mono-code font-medium"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                  Grade / Standing
                </label>
                <input
                  type="text"
                  value={gradeInput}
                  onChange={(e) => setGradeInput(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-900 font-medium"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <div>
                <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                  Issued By / Authorized Signatory
                </label>
                <input
                  type="text"
                  readOnly
                  value={OFFICIAL_SIGNATORY_NAME}
                  className="w-full px-3 py-2 rounded-xl bg-slate-100 border border-slate-200 text-xs font-extrabold text-slate-900 cursor-default"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                  Signatory Designation
                </label>
                <input
                  type="text"
                  readOnly
                  value={OFFICIAL_SIGNATORY_TITLE}
                  className="w-full px-3 py-2 rounded-xl bg-slate-100 border border-slate-200 text-xs font-semibold text-slate-700 cursor-default"
                />
              </div>
            </div>

            <div className="pt-3 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
              <button
                type="button"
                onClick={handleIssue}
                className="min-h-[44px] sm:min-h-0 px-4 py-2.5 sm:py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-black flex items-center justify-center gap-1.5 cursor-pointer shadow-xs transition-colors"
              >
                <Award className="w-4 h-4" />
                <span>Issue & Record in Database</span>
              </button>

              <button
                type="button"
                onClick={() => onPrintCertificate(currentPreviewCert)}
                className="min-h-[44px] sm:min-h-0 px-4 py-2.5 sm:py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black flex items-center justify-center gap-1.5 cursor-pointer shadow-xs transition-colors"
              >
                <Printer className="w-4 h-4" />
                <span>Print A4 Certificate</span>
              </button>
            </div>
          </div>

          {/* Issuance History */}
          <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 shadow-xs space-y-3">
            <h3 className="text-sm font-extrabold text-slate-900 pb-2 border-b border-slate-100">
              Issuance History ({state.certificates.length})
            </h3>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {state.certificates.map(c => (
                <div
                  key={c.id}
                  className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between gap-2 text-xs"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <strong className="text-slate-900">{c.studentName}</strong>
                      <span className="font-mono-code text-[11px] text-blue-600 font-bold">{c.id}</span>
                    </div>
                    <div className="text-[11px] text-slate-500 mt-0.5 break-words">
                      {c.course} • Issued on {c.issueDate} • Authorized by {OFFICIAL_SIGNATORY_NAME}
                    </div>
                  </div>
                  <button
                    onClick={() => onPrintCertificate({ ...c, issuedBy: OFFICIAL_SIGNATORY_NAME })}
                    className="min-w-[44px] min-h-[44px] sm:min-w-0 sm:min-h-0 p-2 rounded-lg bg-white border border-slate-200 hover:bg-slate-100 text-emerald-700 cursor-pointer shadow-2xs flex items-center justify-center shrink-0"
                    title="Print"
                  >
                    <Printer className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right: Live A4 Printable Certificate Preview */}
        <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 shadow-xs space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-slate-100">
            <h3 className="text-sm font-extrabold text-slate-900">Live A4 Certificate Preview</h3>
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-purple-50 text-purple-700 border border-purple-200">
              Printable Surface
            </span>
          </div>

          {/* Certificate Frame */}
          <div className="p-4 sm:p-6 rounded-xl border-4 border-double border-slate-300 bg-white text-slate-900 space-y-4 text-center font-sans shadow-md">
            {/* Dedicated Certificate Crest / Official Seal Logo */}
            {(state.settings.certificateLogoBase64 || state.settings.primaryLogoBase64 || state.settings.logoBase64) && (
              <div className="flex justify-center pb-1">
                <img
                  src={state.settings.certificateLogoBase64 || state.settings.primaryLogoBase64 || state.settings.logoBase64}
                  alt="Official Certificate Crest"
                  style={{ height: '95px', maxHeight: '110px', width: 'auto', objectFit: 'contain' }}
                  className="mx-auto block"
                />
              </div>
            )}

            <div className="space-y-1">
              <div className="text-[10px] font-mono-code font-black uppercase text-blue-700 tracking-widest">
                OFFICIAL INSTITUTIONAL ACADEMIC CREDENTIAL
              </div>
              <h2 className="text-lg sm:text-xl font-black uppercase tracking-tight text-slate-900">
                {state.settings.instituteName}
              </h2>
              <p className="text-[11px] text-slate-600">
                {getActiveInstituteAddress(state.settings).fullAddress || 'No address entered. Please add your institute/branch address in Settings.'}
              </p>
            </div>

            <div className="py-2">
              <span className="inline-block px-3 py-1 rounded-full bg-violet-50 text-violet-900 font-black text-xs uppercase tracking-widest border border-violet-200">
                {state.settings.certificateHeading || 'Certificate of Course Completion'}
              </span>
            </div>

            <div className="space-y-1">
              <p className="text-xs italic text-slate-500">This is to officially certify that</p>
              <h3 className="text-xl sm:text-2xl font-black text-slate-900 underline underline-offset-4 decoration-slate-300">
                {currentPreviewCert.studentName}
              </h3>
              <p className="text-xs text-slate-600 max-w-md mx-auto pt-1 leading-relaxed">
                {state.settings.certificateAuthorityText || 'has successfully completed all prescribed practical curriculum, technical trading assessments, and mentorship requirements for:'}
              </p>
              <div className="text-base font-extrabold text-blue-800 pt-1">
                "{currentPreviewCert.course}"
              </div>
              <div className="text-xs font-bold text-emerald-700 mt-1">
                Standing: {currentPreviewCert.grade}
              </div>
            </div>

            <div className="pt-6 border-t border-slate-200 flex flex-col sm:flex-row items-center sm:items-end justify-between gap-4 text-center sm:text-left text-xs">
              <div className="space-y-0.5 font-mono-code text-[11px]">
                <div>Cert ID: <strong>{currentPreviewCert.id}</strong></div>
                <div>Student ID: <strong>{currentPreviewCert.regId}</strong></div>
                <div>Date: <strong>{currentPreviewCert.issueDate}</strong></div>
              </div>

              <div className="text-center">
                <div className="w-12 h-12 rounded-full border-2 border-dashed border-amber-600 bg-amber-50 flex items-center justify-center text-[9px] font-black text-amber-900 mx-auto">
                  SEAL
                </div>
              </div>

              <div className="text-center sm:text-right space-y-0.5">
                {state.settings.signatureBase64 && (
                  <img
                    src={state.settings.signatureBase64}
                    alt="Authorized Signature"
                    style={{ maxHeight: '38px', maxWidth: '120px', objectFit: 'contain' }}
                    className="block mx-auto sm:ml-auto sm:mr-0 mb-0.5"
                  />
                )}
                <div className="font-extrabold text-slate-900">{OFFICIAL_SIGNATORY_NAME}</div>
                <div className="text-[10px] text-slate-600">{OFFICIAL_SIGNATORY_TITLE}</div>
                <div className="text-[9px] text-slate-400">Authorized Signatory</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
