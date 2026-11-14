import React, { useState, useEffect } from 'react';
import { AppState, Course, Batch, CourseLecture } from '../types';
import {
  BookOpen,
  Calendar,
  Users,
  Plus,
  Clock,
  Edit2,
  Trash2,
  AlertCircle,
  Search,
  CheckCircle2,
  Video,
  Laptop,
  Presentation
} from 'lucide-react';

interface BatchesViewProps {
  state: AppState;
  onOpenBatchModal: (batchCode?: string) => void;
  onDeleteBatch: (batchCode: string) => void;
  onOpenCourseModal: (courseId?: string) => void;
  onUpdateCourseField?: (courseId: string, field: string, value: any) => void;
  onDeleteCourse: (courseId: string) => void;
  onToggleCourseStatus: (courseId: string) => void;
  onOpenLectureModal: (courseId?: string, lectureId?: string) => void;
  onDeleteLecture: (courseId: string, lectureId: string) => void;
  onToggleLectureComplete: (courseId: string, lectureId: string) => void;
  onOpenBatchRoster: (batchCode: string) => void;
  onAssignStudentToBatch: (studentId: string, batchCode: string) => void;
  onNavigateToAttendance: (batchCode: string) => void;
  onQueueBatchAnnouncement: (batchCode: string) => void;
}

export const BatchesView: React.FC<BatchesViewProps> = ({
  state,
  onOpenBatchModal,
  onDeleteBatch,
  onOpenCourseModal,
  onUpdateCourseField,
  onDeleteCourse,
  onToggleCourseStatus,
  onOpenLectureModal,
  onDeleteLecture,
  onToggleLectureComplete,
  onOpenBatchRoster,
  onAssignStudentToBatch,
  onNavigateToAttendance,
  onQueueBatchAnnouncement
}) => {
  const [subView, setSubView] = useState<'courses' | 'cards' | 'table' | 'unassigned'>('courses');
  const [courseSearch, setCourseSearch] = useState('');
  const [courseStatusFilter, setCourseStatusFilter] = useState<'ALL' | 'Active' | 'Archived'>('ALL');
  const [expandedInlineEditorId, setExpandedInlineEditorId] = useState<string | null>(null);
  const [, setTick] = useState(0);

  const updateCourseField = (courseId: string, field: string, value: any) => {
    if (onUpdateCourseField) {
      onUpdateCourseField(courseId, field, value);
    } else if (typeof (window as any).updateCourseField === 'function') {
      (window as any).updateCourseField(courseId, field, value);
    }
  };

  // Attach global functions to window for reliable inline/global event execution
  useEffect(() => {
    if (typeof window !== 'undefined') {
      (window as any).openEditCourseModal = (id: string) => onOpenCourseModal(id);
      (window as any).deleteCourse = (id: string) => {
        onDeleteCourse(id);
        setTick(t => t + 1);
      };
      (window as any).openEditBatchModal = (code: string) => onOpenBatchModal(code);
      (window as any).deleteBatch = (code: string) => {
        onDeleteBatch(code);
        setTick(t => t + 1);
      };
      (window as any).openAddLectureModal = (courseId?: string, lectureId?: string) => {
        onOpenLectureModal(courseId, lectureId);
      };
      (window as any).deleteLecture = (courseId: string, lectureId: string) => {
        onDeleteLecture(courseId, lectureId);
        setTick(t => t + 1);
      };
      (window as any).toggleLectureComplete = (courseId: string, lectureId: string) => {
        onToggleLectureComplete(courseId, lectureId);
        setTick(t => t + 1);
      };
    }
  }, [
    onOpenCourseModal,
    onDeleteCourse,
    onOpenBatchModal,
    onDeleteBatch,
    onOpenLectureModal,
    onDeleteLecture,
    onToggleLectureComplete
  ]);

  const unassignedStudents = state.students.filter(s => !s.batch && s.status !== 'Archived');

  // Filter courses
  const filteredCourses = state.courses.filter(c => {
    if (courseStatusFilter !== 'ALL') {
      const cStatus = c.status || 'Active';
      if (cStatus !== courseStatusFilter) return false;
    }
    if (courseSearch.trim()) {
      const q = courseSearch.toLowerCase().trim();
      const lecTitles = (c.lectures || []).map(l => `${l.title} ${l.module}`).join(' ');
      const combined = `${c.name} ${c.id} ${c.code || ''} ${c.instructor} ${c.mode} ${c.syllabus} ${lecTitles}`.toLowerCase();
      if (!combined.includes(q)) return false;
    }
    return true;
  });

  const totalSyllabusLectures = state.courses.reduce((acc, c) => acc + (c.lectures?.length || 0), 0);

  return (
    <div className="space-y-4">
      {/* Title Bar */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-xs flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5 flex-wrap">
            <h1 className="text-lg font-black text-slate-900 tracking-tight flex items-center gap-2">
              <BookOpen className="w-5 h-5 text-blue-600" />
              <span>Course Curriculum, Syllabus Lectures & Batch Operations</span>
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-50 text-blue-700 border border-blue-200 font-mono-code">
              {state.courses.length} Courses • {totalSyllabusLectures} Syllabus Lectures • {state.batches.length} Batches
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1 font-medium">
            Manage courses, add/edit syllabus lectures per course, schedule classroom batches, and assign student rosters
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Sub-view selector pills */}
          <div className="p-1 rounded-xl bg-slate-100 border border-slate-200 flex items-center gap-1">
            <button
              type="button"
              onClick={() => setSubView('courses')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer transition-all ${
                subView === 'courses' ? 'bg-white text-blue-700 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Courses & Lectures ({state.courses.length})
            </button>
            <button
              type="button"
              onClick={() => setSubView('cards')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer transition-all ${
                subView === 'cards' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Batch Cards ({state.batches.length})
            </button>
            <button
              type="button"
              onClick={() => setSubView('table')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer transition-all ${
                subView === 'table' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Batch Table
            </button>
            <button
              type="button"
              onClick={() => setSubView('unassigned')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer transition-all flex items-center gap-1.5 ${
                subView === 'unassigned' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <span>Unassigned</span>
              {unassignedStudents.length > 0 && (
                <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-amber-100 text-amber-800 font-bold">
                  {unassignedStudents.length}
                </span>
              )}
            </button>
          </div>

          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              onOpenCourseModal();
            }}
            className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-extrabold flex items-center gap-1.5 shadow-xs cursor-pointer transition-all"
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span>+ Add Course</span>
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              onOpenLectureModal(state.courses[0]?.id);
            }}
            className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold flex items-center gap-1.5 shadow-xs cursor-pointer transition-all"
          >
            <Calendar className="w-3.5 h-3.5" />
            <span>+ Add Lecture</span>
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              onOpenBatchModal();
            }}
            className="px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-extrabold flex items-center gap-1.5 shadow-xs cursor-pointer transition-all"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Create Batch</span>
          </button>
        </div>
      </div>

      {/* SUBVIEW 1: COURSES CATALOG & SYLLABUS LECTURE MANAGER */}
      {subView === 'courses' && (
        <div className="space-y-4">
          {/* Courses Search & Actions Bar */}
          <div className="bg-white border border-slate-200/90 rounded-2xl shadow-xs p-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex-1 min-w-[260px] relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={courseSearch}
                onChange={(e) => setCourseSearch(e.target.value)}
                placeholder="Search courses or syllabus lectures by title, code, instructor..."
                className="w-full pl-9 pr-4 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-900 font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white"
              />
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              {(['ALL', 'Active', 'Archived'] as const).map(st => (
                <button
                  key={st}
                  type="button"
                  onClick={() => setCourseStatusFilter(st)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold cursor-pointer transition-all ${
                    courseStatusFilter === st
                      ? 'bg-slate-900 text-white shadow-xs'
                      : 'bg-slate-100 hover:bg-slate-200 text-slate-600'
                  }`}
                >
                  {st === 'ALL' ? 'All Courses' : st}
                </button>
              ))}

              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  onOpenCourseModal();
                }}
                className="ml-1 px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black flex items-center gap-1.5 cursor-pointer shadow-xs transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Course</span>
              </button>
            </div>
          </div>

          {/* Course Cards with Integrated Syllabus Lecture Pipeline */}
          {filteredCourses.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-2xl p-10 text-center text-slate-500">
              <BookOpen className="w-8 h-8 text-slate-300 mx-auto mb-2" />
              <span className="font-bold text-sm block text-slate-800">No courses found</span>
              <span className="text-xs text-slate-400">
                {courseSearch ? 'Try a different search term.' : 'Click "+ Add Course" to create a new curriculum.'}
              </span>
            </div>
          ) : (
            <div className="space-y-4">
              {filteredCourses.map(c => {
                const cStatus = c.status || 'Active';
                const lectures = c.lectures || [];
                const completedCount = lectures.filter(l => l.completed).length;

                return (
                  <div
                    key={c.id}
                    className="bg-white border border-slate-200/90 rounded-2xl shadow-xs overflow-hidden hover:border-slate-300 transition-all"
                  >
                    {/* Course Header Row */}
                    <div className="p-5 flex flex-wrap items-start justify-between gap-4 border-b border-slate-100">
                      <div className="space-y-1.5 max-w-3xl flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="px-2.5 py-0.5 rounded-md text-xs font-mono font-bold bg-blue-50 text-blue-700 border border-blue-200">
                            {c.code || c.id}
                          </span>
                          <button
                            type="button"
                            onClick={() => onToggleCourseStatus(c.id)}
                            title="Click to toggle Active / Archived status"
                            className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold cursor-pointer transition-colors ${
                              cStatus === 'Active'
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100'
                                : 'bg-slate-100 text-slate-600 border border-slate-200 hover:bg-slate-200'
                            }`}
                          >
                            {cStatus}
                          </button>
                          <span className="px-2.5 py-0.5 rounded-md text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                            {c.mode} • {c.duration}
                          </span>
                          <label className="inline-flex items-center gap-1.5 text-xs text-slate-600 font-semibold bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-0.5">
                            <span>👨‍🏫 Lead Faculty:</span>
                            <input
                              type="text"
                              value={c.instructor || ''}
                              onChange={(e) => updateCourseField(c.id, 'instructor', e.target.value)}
                              className="bg-transparent font-extrabold text-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-500 rounded px-1 py-0.5 min-w-[130px]"
                              title="Live edit instructor name (auto-saves to ssm_courses_data & cloud)"
                            />
                          </label>
                        </div>

                        <h2 className="text-base font-black text-slate-900">{c.name}</h2>
                        <p className="text-xs text-slate-600 leading-relaxed">{c.syllabus}</p>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 shrink-0">
                        <div className="text-right mr-2">
                          <div className="text-[10px] font-bold uppercase text-slate-400">Course Fee</div>
                          <div className="text-base font-black font-mono text-emerald-700">
                            ₹{Number(c.fee || 0).toLocaleString('en-IN')}
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => setExpandedInlineEditorId(prev => (prev === c.id ? null : c.id))}
                          className={`px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors border ${
                            expandedInlineEditorId === c.id
                              ? 'bg-blue-600 text-white border-blue-600'
                              : 'bg-blue-50 hover:bg-blue-100 text-blue-700 border-blue-200'
                          }`}
                          title="Toggle inline live editor for Course Title, Instructor, Fees, Status, and Syllabus"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                          <span>{expandedInlineEditorId === c.id ? 'Close Live Edit' : 'Quick Inline Edit'}</span>
                        </button>

                        {/* ADD LECTURE BUTTON (Passes courseId directly) */}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            if (typeof (window as any).openAddLectureModal === 'function') {
                              (window as any).openAddLectureModal(c.id);
                            } else {
                              onOpenLectureModal(c.id);
                            }
                          }}
                          className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold flex items-center gap-1.5 cursor-pointer shadow-xs transition-colors"
                          title={`Add a new syllabus lecture to ${c.name}`}
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>Add Lecture</span>
                        </button>

                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            onOpenCourseModal(c.id);
                          }}
                          className="px-3 py-2 rounded-xl bg-slate-100 hover:bg-blue-50 text-slate-700 hover:text-blue-700 border border-slate-200 hover:border-blue-200 text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors"
                          title="Edit Course Details in Modal"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                          <span>Edit Course</span>
                        </button>

                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            onDeleteCourse(c.id);
                          }}
                          className="px-3 py-2 rounded-xl bg-slate-100 hover:bg-rose-50 text-slate-700 hover:text-rose-700 border border-slate-200 hover:border-rose-200 text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors"
                          title="Delete Course"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Delete</span>
                        </button>
                      </div>
                    </div>

                    {/* Controlled Two-Way Inline Course Editor (Auto-Persists to ssm_courses_data & Cloud) */}
                    {expandedInlineEditorId === c.id && (
                      <div className="px-5 py-4 bg-blue-50/40 border-b border-blue-100 space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-extrabold uppercase tracking-wider text-blue-800 flex items-center gap-1.5">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                            <span>Live Two-Way Course Editor — Auto-Saved to ssm_courses_data & Cloud</span>
                          </span>
                          <span className="text-[10px] font-mono text-slate-500">ID: {c.id}</span>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                          <div>
                            <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                              Course Title
                            </label>
                            <input
                              type="text"
                              value={c.name || ''}
                              onChange={(e) => updateCourseField(c.id, 'name', e.target.value)}
                              className="w-full px-2.5 py-1.5 rounded-lg bg-white border border-slate-200 text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                              Lead Instructor
                            </label>
                            <input
                              type="text"
                              value={c.instructor || ''}
                              onChange={(e) => updateCourseField(c.id, 'instructor', e.target.value)}
                              className="w-full px-2.5 py-1.5 rounded-lg bg-white border border-slate-200 text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                              Course Fee (₹)
                            </label>
                            <input
                              type="number"
                              value={c.fee ?? 0}
                              onChange={(e) => updateCourseField(c.id, 'fee', Math.max(0, Number(e.target.value) || 0))}
                              className="w-full px-2.5 py-1.5 rounded-lg bg-white border border-slate-200 text-xs font-mono font-bold text-emerald-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                              Duration & Mode
                            </label>
                            <div className="flex gap-1.5">
                              <input
                                type="text"
                                value={c.duration || ''}
                                onChange={(e) => updateCourseField(c.id, 'duration', e.target.value)}
                                className="w-1/2 px-2 py-1.5 rounded-lg bg-white border border-slate-200 text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                              />
                              <select
                                value={c.mode || 'Hybrid'}
                                onChange={(e) => updateCourseField(c.id, 'mode', e.target.value)}
                                className="w-1/2 px-2 py-1.5 rounded-lg bg-white border border-slate-200 text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                              >
                                <option value="Classroom">Classroom</option>
                                <option value="Online">Online</option>
                                <option value="Hybrid">Hybrid</option>
                                <option value="1-on-1">1-on-1</option>
                              </select>
                            </div>
                          </div>
                          <div>
                            <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                              Status
                            </label>
                            <select
                              value={cStatus}
                              onChange={(e) => updateCourseField(c.id, 'status', e.target.value)}
                              className="w-full px-2.5 py-1.5 rounded-lg bg-white border border-slate-200 text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            >
                              <option value="Active">Active</option>
                              <option value="Archived">Archived</option>
                            </select>
                          </div>
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                            Course Syllabus Summary
                          </label>
                          <textarea
                            rows={2}
                            value={c.syllabus || ''}
                            onChange={(e) => updateCourseField(c.id, 'syllabus', e.target.value)}
                            className="w-full px-2.5 py-1.5 rounded-lg bg-white border border-slate-200 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        </div>
                      </div>
                    )}

                    {/* Course Syllabus Lectures List */}
                    <div className="bg-slate-50/70 p-4 space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2 text-xs font-extrabold text-slate-800">
                          <Calendar className="w-4 h-4 text-emerald-600" />
                          <span>
                            Course Syllabus & Scheduled Lectures ({lectures.length}{' '}
                            {lectures.length === 1 ? 'Lecture' : 'Lectures'})
                          </span>
                          {lectures.length > 0 && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                              {completedCount}/{lectures.length} Completed
                            </span>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            onOpenLectureModal(c.id);
                          }}
                          className="text-xs font-extrabold text-emerald-700 hover:text-emerald-800 flex items-center gap-1 cursor-pointer"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>+ Add New Lecture to {c.code || c.id}</span>
                        </button>
                      </div>

                      {lectures.length === 0 ? (
                        <div className="p-4 rounded-xl bg-white border border-dashed border-slate-300 text-center text-xs text-slate-500 flex flex-wrap items-center justify-center gap-2">
                          <span>No syllabus lectures added for this course yet.</span>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.preventDefault();
                              onOpenLectureModal(c.id);
                            }}
                            className="px-3 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold cursor-pointer"
                          >
                            + Add First Lecture
                          </button>
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          {lectures.map((lec) => (
                            <div
                              key={lec.id}
                              className={`p-3.5 rounded-xl bg-white border text-xs flex flex-col justify-between gap-2.5 shadow-2xs transition-all ${
                                lec.completed
                                  ? 'border-emerald-200 bg-emerald-50/20'
                                  : 'border-slate-200 hover:border-slate-300'
                              }`}
                            >
                              <div className="space-y-1.5">
                                <div className="flex items-center justify-between gap-2 flex-wrap">
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
                                      {lec.module || 'Module 1'}
                                    </span>
                                    <span
                                      className={`px-2 py-0.5 rounded-md text-[10px] font-bold flex items-center gap-1 ${
                                        lec.sessionType === 'Trading Lab'
                                          ? 'bg-amber-50 text-amber-800 border border-amber-200'
                                          : lec.sessionType === 'Recorded Video'
                                          ? 'bg-purple-50 text-purple-700 border border-purple-200'
                                          : 'bg-blue-50 text-blue-700 border border-blue-200'
                                      }`}
                                    >
                                      {lec.sessionType === 'Trading Lab' ? (
                                        <Laptop className="w-3 h-3" />
                                      ) : lec.sessionType === 'Recorded Video' ? (
                                        <Video className="w-3 h-3" />
                                      ) : (
                                        <Presentation className="w-3 h-3" />
                                      )}
                                      <span>{lec.sessionType}</span>
                                    </span>
                                  </div>

                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      onToggleLectureComplete(c.id, lec.id);
                                    }}
                                    className={`px-2 py-0.5 rounded-full text-[10px] font-bold cursor-pointer flex items-center gap-1 border ${
                                      lec.completed
                                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                        : 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200'
                                    }`}
                                    title="Click to toggle Completed / Scheduled"
                                  >
                                    <CheckCircle2 className="w-3 h-3" />
                                    <span>{lec.completed ? 'Completed' : 'Scheduled'}</span>
                                  </button>
                                </div>

                                <div className="font-extrabold text-slate-900 text-xs">{lec.title}</div>
                                {lec.summaryOrLink && (
                                  <p className="text-[11px] text-slate-600 leading-relaxed">{lec.summaryOrLink}</p>
                                )}
                              </div>

                              <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span>👨‍🏫 {lec.instructor}</span>
                                  <span>• 🕒 {lec.scheduledDateTime}</span>
                                  <span>• ⏱️ {lec.durationMins} mins</span>
                                </div>

                                <div className="flex items-center gap-1.5">
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      onOpenLectureModal(c.id, lec.id);
                                    }}
                                    className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-indigo-50 text-slate-700 hover:text-indigo-700 border border-slate-200 text-[11px] font-bold flex items-center gap-1 cursor-pointer transition-colors"
                                  >
                                    <Edit2 className="w-3 h-3" />
                                    <span>Edit</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      onDeleteLecture(c.id, lec.id);
                                    }}
                                    className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-rose-50 text-slate-700 hover:text-rose-700 border border-slate-200 text-[11px] font-bold flex items-center gap-1 cursor-pointer transition-colors"
                                  >
                                    <Trash2 className="w-3 h-3" />
                                    <span>Delete</span>
                                  </button>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* SUBVIEW 2: BATCH CARDS */}
      {subView === 'cards' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {state.batches.map(b => {
            const enrolled = state.students.filter(s => s.batch === b.code && s.status !== 'Archived');
            const fillPct = Math.round((enrolled.length / (b.capacity || 25)) * 100);
            const batchLectures = state.lectures.filter(l => l.batchCode === b.code);
            const matchedCourse = state.courses.find(c => c.name === b.course) || state.courses[0];

            return (
              <div key={b.code} className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-xs space-y-4 flex flex-col justify-between hover:border-slate-300 transition-all">
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="px-2.5 py-0.5 rounded-md text-xs font-mono-code font-bold bg-blue-50 text-blue-700 border border-blue-200">
                          {b.code}
                        </span>
                        <span
                          className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                            b.status === 'Active'
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : 'bg-amber-50 text-amber-700 border border-amber-200'
                          }`}
                        >
                          {b.status}
                        </span>
                        <span className="px-2.5 py-0.5 rounded-md text-[10px] font-bold bg-purple-50 text-purple-700 border border-purple-200">
                          {b.mode}
                        </span>
                      </div>
                      <h2 className="text-base font-extrabold text-slate-900 mt-2">{b.name}</h2>
                      <p className="text-xs font-bold text-blue-600">{b.course}</p>
                    </div>

                    <div className="text-right font-mono-code shrink-0">
                      <div className="text-lg font-black text-slate-900">
                        {enrolled.length} / {b.capacity}
                      </div>
                      <div className="text-xs text-blue-600 font-bold">{fillPct}% Full</div>
                    </div>
                  </div>

                  <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 space-y-1.5 text-xs text-slate-700">
                    <div>
                      👨‍🏫 <strong>Instructor:</strong> {b.instructor}
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-slate-400" />
                      <span>{b.schedule}</span>
                    </div>
                    <div className="text-slate-500 font-mono-code text-[11px]">
                      Duration: {b.startDate} → {b.endDate || 'Ongoing'}
                    </div>
                  </div>

                  {/* Student preview badges */}
                  <div>
                    <div className="text-[11px] font-bold uppercase text-slate-500 mb-1.5">
                      Enrolled Students ({enrolled.length}):
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {enrolled.length > 0 ? (
                        enrolled.map(s => (
                          <span
                            key={s.id}
                            className="px-2.5 py-0.5 rounded-md text-[10px] font-medium bg-slate-100 text-slate-800 border border-slate-200"
                          >
                            {s.name}
                          </span>
                        ))
                      ) : (
                        <span className="text-xs text-slate-400 italic">No students assigned to this batch yet.</span>
                      )}
                    </div>
                  </div>

                  {/* Next Lecture info */}
                  {batchLectures.length > 0 && (
                    <div className="text-xs text-slate-600 pt-2 border-t border-slate-100 flex items-center gap-2">
                      <span className="font-bold text-amber-700">Next Lecture:</span>
                      <span>
                        {batchLectures[0].date} ({batchLectures[0].time}) — <em>{batchLectures[0].topic}</em>
                      </span>
                    </div>
                  )}
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-slate-100">
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => onOpenBatchRoster(b.code)}
                      className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors shadow-2xs"
                    >
                      <Users className="w-3.5 h-3.5" />
                      <span>Roster & Transfer</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => onOpenLectureModal(matchedCourse?.id)}
                      className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1 cursor-pointer shadow-2xs"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Add Lecture</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => onNavigateToAttendance(b.code)}
                      className="px-3 py-1.5 rounded-lg bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-semibold border border-slate-200 cursor-pointer"
                    >
                      Attendance
                    </button>
                    <button
                      type="button"
                      onClick={() => onQueueBatchAnnouncement(b.code)}
                      className="px-3 py-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-xs font-bold border border-emerald-200 cursor-pointer"
                    >
                      📣 WhatsApp
                    </button>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => onOpenBatchModal(b.code)}
                      className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 hover:text-slate-800 cursor-pointer"
                      title="Edit Batch"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onDeleteBatch(b.code)}
                      className="p-1.5 rounded-lg hover:bg-rose-50 text-slate-400 hover:text-rose-600 cursor-pointer"
                      title="Delete Batch"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* SUBVIEW 3: TABLE VIEW */}
      {subView === 'table' && (
        <>
          <div className="hidden md:block bg-white border border-slate-200/90 rounded-2xl shadow-xs overflow-hidden">
            <div className="overflow-x-auto max-h-[70vh]">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="sticky top-0 z-10 bg-slate-50 shadow-[0_1px_0_0_#e2e8f0]">
                  <tr className="bg-slate-50 text-slate-600 border-b border-slate-200 text-[11px] font-bold uppercase tracking-wider">
                    <th className="p-3.5">Batch Code & Name</th>
                    <th className="p-3.5">Course</th>
                    <th className="p-3.5">Mode & Instructor</th>
                    <th className="p-3.5">Schedule</th>
                    <th className="p-3.5">Enrolled / Capacity</th>
                    <th className="p-3.5">Status</th>
                    <th className="p-3.5 text-right">Actions</th>
                  </tr>
                </thead>
              <tbody className="divide-y divide-slate-100">
                {state.batches.map(b => {
                  const enrolled = state.students.filter(s => s.batch === b.code && s.status !== 'Archived');
                  return (
                    <tr key={b.code} className="hover:bg-slate-50/80 transition-colors">
                      <td className="p-3.5">
                        <strong className="font-mono-code text-blue-600">{b.code}</strong>
                        <div className="text-slate-900 font-bold">{b.name}</div>
                      </td>
                      <td className="p-3.5 text-slate-800">{b.course}</td>
                      <td className="p-3.5">
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-purple-50 text-purple-700 border border-purple-200">
                          {b.mode}
                        </span>
                        <div className="text-slate-500 text-[11px] mt-0.5">{b.instructor}</div>
                      </td>
                      <td className="p-3.5 text-slate-600">
                        <div>{b.schedule}</div>
                        <div className="text-[10px] text-slate-400 font-mono-code">
                          {b.startDate} → {b.endDate || 'Ongoing'}
                        </div>
                      </td>
                      <td className="p-3.5 font-mono-code font-bold text-slate-900">
                        {enrolled.length} / {b.capacity}
                      </td>
                      <td className="p-3.5">
                        <span
                          className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                            b.status === 'Active' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-amber-50 text-amber-700 border border-amber-200'
                          }`}
                        >
                          {b.status}
                        </span>
                      </td>
                      <td className="p-3.5 text-right">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => onOpenBatchRoster(b.code)}
                            className="px-2.5 py-1 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-2xs cursor-pointer"
                          >
                            Roster
                          </button>
                          <button
                            type="button"
                            onClick={() => onOpenBatchModal(b.code)}
                            className="px-2.5 py-1 rounded-lg bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 text-xs font-semibold cursor-pointer"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => onDeleteBatch(b.code)}
                            className="p-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 cursor-pointer"
                            title="Delete Batch"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="block md:hidden space-y-3">
            {state.batches.map(b => {
              const enrolled = state.students.filter(s => s.batch === b.code && s.status !== 'Archived');
              return (
                <div key={b.code} className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className="font-mono-code text-xs font-extrabold text-blue-600">{b.code}</span>
                      <h3 className="text-base font-black text-slate-900 mt-0.5">{b.name}</h3>
                      <div className="text-xs font-bold text-slate-600">{b.course}</div>
                    </div>
                    <span
                      className={`px-2.5 py-1 rounded-full text-xs font-extrabold ${
                        b.status === 'Active' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-amber-50 text-amber-700 border border-amber-200'
                      }`}
                    >
                      {b.status}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2.5 p-3 rounded-xl bg-slate-50 border border-slate-200/80 text-xs">
                    <div>
                      <div className="text-[11px] font-bold text-slate-400 uppercase">Instructor</div>
                      <div className="font-bold text-slate-900 mt-0.5">{b.instructor}</div>
                    </div>
                    <div>
                      <div className="text-[11px] font-bold text-slate-400 uppercase">Capacity</div>
                      <div className="font-mono-code font-black text-slate-900 mt-0.5">{enrolled.length} / {b.capacity}</div>
                    </div>
                    <div className="col-span-2">
                      <div className="text-[11px] font-bold text-slate-400 uppercase">Schedule</div>
                      <div className="font-bold text-slate-800 mt-0.5">{b.schedule}</div>
                    </div>
                  </div>
                  <div className="pt-2 border-t border-slate-100 grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => onOpenBatchRoster(b.code)}
                      className="min-h-[44px] py-2 px-2 rounded-xl bg-blue-600 text-white font-extrabold text-xs cursor-pointer flex items-center justify-center"
                    >
                      Roster ({enrolled.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => onOpenBatchModal(b.code)}
                      className="min-h-[44px] py-2 px-2 rounded-xl bg-slate-100 text-slate-800 border border-slate-200 font-extrabold text-xs cursor-pointer flex items-center justify-center"
                    >
                      Edit Batch
                    </button>
                    <button
                      type="button"
                      onClick={() => onDeleteBatch(b.code)}
                      className="min-h-[44px] py-2 px-2 rounded-xl bg-rose-50 text-rose-700 border border-rose-200 font-extrabold text-xs flex items-center justify-center gap-1 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Delete</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* SUBVIEW 4: UNASSIGNED STUDENTS */}
      {subView === 'unassigned' && (
        <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-xs space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div>
              <h2 className="text-sm font-extrabold text-slate-900 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-amber-600" />
                <span>Students Pending Batch Assignment</span>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200">
                  {unassignedStudents.length} Students
                </span>
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Assign newly admitted students to active batches so they appear in daily lecture registers and timetables
              </p>
            </div>
          </div>

          {unassignedStudents.length === 0 ? (
            <div className="p-8 text-center text-xs text-emerald-700 font-bold bg-emerald-50 rounded-xl border border-emerald-200">
              ✓ Excellent! Every active student is currently assigned to a batch.
            </div>
          ) : (
            <div className="space-y-3">
              {unassignedStudents.map(s => (
                <div
                  key={s.id}
                  className="p-4 rounded-xl bg-slate-50 border border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs"
                >
                  <div>
                    <strong className="text-slate-900 text-sm font-bold">{s.name}</strong>{' '}
                    <span className="font-mono-code text-blue-600">({s.regId})</span>
                    <div className="text-slate-500 mt-0.5">
                      Course: <strong>{s.course}</strong> • 📱 {s.phone} • Enrolled on {s.enrollDate}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <select
                      id={`batch-assign-select-${s.id}`}
                      className="px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-xs text-slate-900 font-medium"
                      defaultValue=""
                    >
                      <option value="" disabled>Select Target Batch...</option>
                      {state.batches.map(b => (
                        <option key={b.code} value={b.code}>
                          {b.code} — {b.name} ({b.schedule})
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => {
                        const sel = document.getElementById(`batch-assign-select-${s.id}`) as HTMLSelectElement;
                        if (sel && sel.value) {
                          onAssignStudentToBatch(s.id, sel.value);
                        }
                      }}
                      className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-extrabold cursor-pointer shadow-2xs"
                    >
                      Assign Now
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
