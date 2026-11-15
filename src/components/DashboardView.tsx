import React, { useState, useMemo, useEffect, useRef } from 'react';
import { AppState, Student, Batch, Lead } from '../types';
import { NavTabId } from './Navbar';
import {
  Users,
  IndianRupee,
  AlertCircle,
  TrendingUp,
  Sparkles,
  Plus,
  Search,
  ChevronRight,
  Phone,
  MessageCircle,
  Calendar,
  Clock,
  CheckCircle2,
  UserPlus,
  FileSpreadsheet,
  ArrowUpRight,
  Filter,
  Layers,
  ShieldAlert,
  History,
  Database,
  GripVertical,
  Maximize2,
  Minimize2,
  Eye,
  EyeOff,
  RotateCcw,
  ChevronUp,
  ChevronDown,
  SlidersHorizontal,
  LayoutGrid,
  PieChart,
  Award,
  Flame,
  Cloud
} from 'lucide-react';

interface DashboardViewProps {
  state: AppState;
  onNavigate: (tab: NavTabId) => void;
  onOpenStudentModal: (id?: string) => void;
  onOpenLeadModal: (id?: string) => void;
  onOpenFeeModal: (studentId: string) => void;
  onOpenWaStudioForContact: (type: 'student' | 'lead', id: string, scenarioHint?: string) => void;
  onOpenGoogleSheetsExport: () => void;
  onOpenAiDrawer: () => void;
  onOpenManualEntry?: () => void;
  onOpenCloudIntegrations?: () => void;
}

type WidgetId =
  | 'kpi_strip'
  | 'interactive_analytics'
  | 'overdue_fees'
  | 'priority_leads'
  | 'active_batches'
  | 'attendance_watch'
  | 'audit_trail';

type WidgetSpan = 4 | 6 | 8 | 12;

interface WidgetConfig {
  id: WidgetId;
  title: string;
  span: WidgetSpan;
  collapsed: boolean;
  visible: boolean;
  expandedHeight: boolean;
}

const DEFAULT_WIDGET_LAYOUT: WidgetConfig[] = [
  { id: 'kpi_strip', title: 'Core Institute KPIs', span: 12, collapsed: false, visible: true, expandedHeight: false },
  {
    id: 'interactive_analytics',
    title: 'Interactive Financial & Funnel Analytics',
    span: 12,
    collapsed: false,
    visible: true,
    expandedHeight: false
  },
  { id: 'overdue_fees', title: 'Fee Recovery & Milestone Dues', span: 8, collapsed: false, visible: true, expandedHeight: false },
  { id: 'priority_leads', title: 'Priority Lead Follow-Ups', span: 4, collapsed: false, visible: true, expandedHeight: false },
  { id: 'active_batches', title: 'Active Batches & Capacity', span: 8, collapsed: false, visible: true, expandedHeight: false },
  { id: 'attendance_watch', title: 'Low Attendance Watchlist', span: 4, collapsed: false, visible: true, expandedHeight: false },
  { id: 'audit_trail', title: 'Live Activity & Sync Audit Trail', span: 12, collapsed: false, visible: true, expandedHeight: false }
];

const LAYOUT_STORAGE_KEY = 'ssm_dashboard_layout_v1';

const CourseBadgePill: React.FC<{ course?: string }> = ({ course }) => {
  const label = (course || 'General Course').trim();
  const lower = label.toLowerCase();
  const colorClass = lower.includes('master') || lower.includes('blueprint')
    ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
    : lower.includes('option') || lower.includes('f&o') || lower.includes('nifty')
    ? 'bg-amber-50 text-amber-800 border-amber-200'
    : lower.includes('basic') || lower.includes('foundation')
    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
    : 'bg-blue-50 text-blue-700 border-blue-200';
  return (
    <span className={`inline-block max-w-full truncate px-2 py-0.5 rounded-md text-[10px] font-extrabold border ${colorClass}`}>
      {label}
    </span>
  );
};

export const DashboardView: React.FC<DashboardViewProps> = ({
  state,
  onNavigate,
  onOpenStudentModal,
  onOpenLeadModal,
  onOpenFeeModal,
  onOpenWaStudioForContact,
  onOpenGoogleSheetsExport,
  onOpenAiDrawer,
  onOpenManualEntry,
  onOpenCloudIntegrations
}) => {
  const [globalSearch, setGlobalSearch] = useState('');
  const [courseFilter, setCourseFilter] = useState<string>('ALL');
  const [dateRangeFilter, setDateRangeFilter] = useState<'ALL' | 'THIS_MONTH' | '30_DAYS' | '90_DAYS'>('ALL');
  const [showLayoutCustomizer, setShowLayoutCustomizer] = useState(false);
  const [analyticsMode, setAnalyticsMode] = useState<'cashflow' | 'batches' | 'funnel'>('cashflow');
  const [activeChartTooltip, setActiveChartTooltip] = useState<{
    label: string;
    primary: string;
    secondary: string;
    accent?: string;
  } | null>(null);
  const [draggedWidgetId, setDraggedWidgetId] = useState<WidgetId | null>(null);
  const [dragOverWidgetId, setDragOverWidgetId] = useState<WidgetId | null>(null);
  const [dragReadyId, setDragReadyId] = useState<WidgetId | null>(null);

  const currency = state.settings?.currencySymbol || '₹';

  // Debounced ResizeObserver hook for chart containers so sidebar collapse / resize updates smoothly
  const chartContainerRef = useRef<HTMLDivElement | null>(null);
  const [chartDimensions, setChartDimensions] = useState<{ width: number; height: number }>({
    width: 680,
    height: 240
  });

  useEffect(() => {
    const el = chartContainerRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    let timerId: number | undefined;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const w = Math.floor(entry.contentRect.width);
        const h = Math.floor(entry.contentRect.height);
        if (w > 0) {
          if (timerId) window.clearTimeout(timerId);
          timerId = window.setTimeout(() => {
            setChartDimensions({ width: w, height: h });
          }, 50);
        }
      }
    });
    ro.observe(el);
    return () => {
      if (timerId) window.clearTimeout(timerId);
      ro.disconnect();
    };
  }, []);

  const [widgets, setWidgets] = useState<WidgetConfig[]>(() => DEFAULT_WIDGET_LAYOUT);

  const updateWidget = (id: WidgetId, patch: Partial<WidgetConfig>) => {
    setWidgets((prev) => prev.map((w) => (w.id === id ? { ...w, ...patch } : w)));
  };

  const moveWidget = (id: WidgetId, direction: 'up' | 'down') => {
    setWidgets((prev) => {
      const idx = prev.findIndex((w) => w.id === id);
      if (idx === -1) return prev;
      const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
      if (targetIdx < 0 || targetIdx >= prev.length) return prev;
      const copy = [...prev];
      const [item] = copy.splice(idx, 1);
      copy.splice(targetIdx, 0, item);
      return copy;
    });
  };

  const handleWidgetDrop = (targetId: WidgetId) => {
    if (!draggedWidgetId || draggedWidgetId === targetId) {
      setDraggedWidgetId(null);
      setDragOverWidgetId(null);
      setDragReadyId(null);
      return;
    }
    setWidgets((prev) => {
      const fromIdx = prev.findIndex((w) => w.id === draggedWidgetId);
      const toIdx = prev.findIndex((w) => w.id === targetId);
      if (fromIdx === -1 || toIdx === -1) return prev;
      const copy = [...prev];
      const [moved] = copy.splice(fromIdx, 1);
      copy.splice(toIdx, 0, moved);
      return copy;
    });
    setDraggedWidgetId(null);
    setDragOverWidgetId(null);
    setDragReadyId(null);
  };

  // Bottom-right corner drag-resize handler for desktop widgets
  const handleStartWidgetCornerResize = (e: React.MouseEvent, widget: WidgetConfig) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startSpan = widget.span;
    const spans: WidgetSpan[] = [4, 6, 8, 12];

    const onMouseMove = (moveEvt: MouseEvent) => {
      const deltaX = moveEvt.clientX - startX;
      const stepOffset = Math.round(deltaX / 180);
      const currentIdx = spans.indexOf(startSpan);
      const nextIdx = Math.max(0, Math.min(spans.length - 1, currentIdx + stepOffset));
      const nextSpan = spans[nextIdx];
      if (nextSpan !== widget.span) {
        updateWidget(widget.id, { span: nextSpan });
      }
    };

    const onMouseUp = () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  const resetLayout = () => {
    setWidgets(DEFAULT_WIDGET_LAYOUT);
  };

  // Active non-archived records
  const students: Student[] = useMemo(
    () =>
      (Array.isArray(state.students) ? state.students : []).filter(
        (s) => !(s as any).isDeleted && s.status !== 'Archived'
      ),
    [state.students]
  );

  const batches: Batch[] = useMemo(
    () =>
      (Array.isArray(state.batches) ? state.batches : []).filter(
        (b) => !(b as any).isDeleted && b.status !== 'Archived'
      ),
    [state.batches]
  );

  const leads: Lead[] = useMemo(
    () => (Array.isArray(state.leads) ? state.leads : []).filter((l) => !(l as any).isDeleted),
    [state.leads]
  );

  const certificates = useMemo(
    () => (Array.isArray(state.certificates) ? state.certificates : []),
    [state.certificates]
  );

  // Helper to compute paid & pending fee for a student from milestones
  const getStudentFeeStats = (s: Student) => {
    const netFee = Number(s.netFee) || Number((s as any).totalFees) || 0;
    const milestones = Array.isArray(s.milestones) ? s.milestones : [];
    const paidFromMilestones = milestones
      .filter((m) => m.status === 'Paid')
      .reduce((sum, m) => sum + (Number(m.amount) || 0), 0);
    const paid = milestones.length > 0 ? paidFromMilestones : Number((s as any).paidFees) || 0;
    const pending = Math.max(0, netFee - paid);
    return { netFee, paid, pending, milestones };
  };

  // Extract unique courses for filter dropdown
  const uniqueCourses = useMemo(() => {
    const set = new Set<string>();
    students.forEach((s) => {
      if (s.course) set.add(s.course.trim());
    });
    return Array.from(set).filter(Boolean);
  }, [students]);

  // Apply course and date filters to students
  const filteredStudents = useMemo(() => {
    const now = new Date();
    return students.filter((s) => {
      if (courseFilter !== 'ALL' && s.course !== courseFilter) return false;
      const dateRef = s.enrollDate || s.joinDate;
      if (dateRangeFilter !== 'ALL' && dateRef) {
        const joinDt = new Date(dateRef);
        if (!isNaN(joinDt.getTime())) {
          const diffDays = (now.getTime() - joinDt.getTime()) / (1000 * 3600 * 24);
          if (dateRangeFilter === 'THIS_MONTH') {
            if (joinDt.getMonth() !== now.getMonth() || joinDt.getFullYear() !== now.getFullYear()) return false;
          } else if (dateRangeFilter === '30_DAYS' && diffDays > 30) {
            return false;
          } else if (dateRangeFilter === '90_DAYS' && diffDays > 90) {
            return false;
          }
        }
      }
      return true;
    });
  }, [students, courseFilter, dateRangeFilter]);

  // Core Financial & Enrollment Metrics
  const metrics = useMemo(() => {
    let totalContractedFees = 0;
    let totalPaidFees = 0;
    let totalPendingFees = 0;
    let paidCount = 0;
    let partialCount = 0;
    let unpaidCount = 0;

    filteredStudents.forEach((s) => {
      const { netFee, paid, pending } = getStudentFeeStats(s);
      totalContractedFees += netFee;
      totalPaidFees += paid;
      totalPendingFees += pending;
      if (netFee > 0 && paid >= netFee) paidCount += 1;
      else if (paid > 0) partialCount += 1;
      else unpaidCount += 1;
    });

    const collectionRate = totalContractedFees > 0 ? Math.round((totalPaidFees / totalContractedFees) * 100) : 0;

    const totalLeads = leads.length;
    const convertedLeads = leads.filter((l) => l.stage === 'Admission Confirmed').length;
    const activeLeads = leads.filter(
      (l) => !['Admission Confirmed', 'Not Interested', 'Lost'].includes(l.stage)
    ).length;
    const hotLeads = leads.filter(
      (l) => l.intent === 'Hot' && !['Admission Confirmed', 'Not Interested', 'Lost'].includes(l.stage)
    ).length;
    const conversionRate = totalLeads > 0 ? Math.round((convertedLeads / totalLeads) * 100) : 0;

    return {
      totalStudents: filteredStudents.length,
      totalContractedFees,
      totalPaidFees,
      totalPendingFees,
      collectionRate,
      paidCount,
      partialCount,
      unpaidCount,
      totalLeads,
      convertedLeads,
      activeLeads,
      hotLeads,
      conversionRate,
      certifiedCount: certificates.length
    };
  }, [filteredStudents, leads, certificates]);

  // Global Quick Search Results
  const searchResults = useMemo(() => {
    const q = globalSearch.trim().toLowerCase();
    if (!q) return { students: [], leads: [] };
    return {
      students: students
        .filter(
          (s) =>
            (s.name || '').toLowerCase().includes(q) ||
            (s.regId || '').toLowerCase().includes(q) ||
            (s.phone || '').toLowerCase().includes(q) ||
            (s.course || '').toLowerCase().includes(q) ||
            (s.batch || '').toLowerCase().includes(q)
        )
        .slice(0, 6),
      leads: leads
        .filter(
          (l) =>
            (l.name || '').toLowerCase().includes(q) ||
            (l.phone || '').toLowerCase().includes(q) ||
            (l.course || '').toLowerCase().includes(q) ||
            (l.locality || '').toLowerCase().includes(q)
        )
        .slice(0, 5)
    };
  }, [globalSearch, students, leads]);

  // Overdue / Pending Fee Students with Milestone Intelligence
  const pendingFeeStudents = useMemo(() => {
    const todayStr = new Date().toISOString().split('T')[0];
    return filteredStudents
      .map((s) => {
        const { netFee, paid, pending, milestones } = getStudentFeeStats(s);
        const overdueMilestone = milestones.find(
          (m) => m.status !== 'Paid' && ((m.dueDate && m.dueDate < todayStr) || m.status === 'Overdue')
        );
        const nextMilestone = milestones.find((m) => m.status !== 'Paid');
        return {
          student: s,
          netFee,
          paid,
          pending,
          overdueMilestone,
          nextMilestone,
          isOverdue: Boolean(overdueMilestone)
        };
      })
      .filter((item) => item.pending > 0)
      .sort((a, b) => {
        if (a.isOverdue && !b.isOverdue) return -1;
        if (!a.isOverdue && b.isOverdue) return 1;
        return b.pending - a.pending;
      });
  }, [filteredStudents]);

  // Active Priority Leads (Follow-ups due or Hot inquiries)
  const priorityLeads = useMemo(() => {
    const todayStr = new Date().toISOString().split('T')[0];
    return leads
      .filter((l) => !['Admission Confirmed', 'Not Interested', 'Lost'].includes(l.stage))
      .map((l) => {
        const isDueTodayOrPast = Boolean(l.followUpDate && l.followUpDate <= todayStr);
        return { lead: l, isDueTodayOrPast };
      })
      .sort((a, b) => {
        if (a.isDueTodayOrPast && !b.isDueTodayOrPast) return -1;
        if (!a.isDueTodayOrPast && b.isDueTodayOrPast) return 1;
        if (a.lead.intent === 'Hot' && b.lead.intent !== 'Hot') return -1;
        if (a.lead.intent !== 'Hot' && b.lead.intent === 'Hot') return 1;
        return (a.lead.followUpDate || '9999').localeCompare(b.lead.followUpDate || '9999');
      });
  }, [leads]);

  // Batch Occupancy & Revenue Summary
  const batchSummaries = useMemo(() => {
    return batches.map((b) => {
      const enrolled = filteredStudents.filter((s) => s.batch === b.code || s.batch === b.name);
      let collected = 0;
      let pending = 0;
      enrolled.forEach((s) => {
        const stats = getStudentFeeStats(s);
        collected += stats.paid;
        pending += stats.pending;
      });
      const capacity = Number(b.capacity) || 25;
      const fillPct = Math.min(100, Math.round((enrolled.length / capacity) * 100));
      return {
        batch: b,
        enrolledCount: enrolled.length,
        capacity,
        fillPct,
        collected,
        pending
      };
    });
  }, [batches, filteredStudents]);

  // Course-wise Cashflow Analytics for Interactive Chart
  const courseCashflowData = useMemo(() => {
    const map = new Map<string, { course: string; collected: number; pending: number; count: number }>();
    filteredStudents.forEach((s) => {
      const key = (s.course || 'General Trading').trim();
      const curr = map.get(key) || { course: key, collected: 0, pending: 0, count: 0 };
      const { paid, pending } = getStudentFeeStats(s);
      curr.collected += paid;
      curr.pending += pending;
      curr.count += 1;
      map.set(key, curr);
    });
    return Array.from(map.values()).sort((a, b) => b.collected + b.pending - (a.collected + a.pending));
  }, [filteredStudents]);

  // Lead Pipeline Funnel Data for Interactive Chart
  const leadFunnelData = useMemo(() => {
    const stages: Array<{ stage: string; count: number; color: string }> = [
      {
        stage: 'New & Contacted',
        count: leads.filter((l) => l.stage === 'New Enquiry' || l.stage === 'Contacted').length,
        color: 'bg-sky-500'
      },
      {
        stage: 'Interested & Demo',
        count: leads.filter(
          (l) => l.stage === 'Interested' || l.stage === 'Demo Scheduled' || l.stage === 'Demo Attended'
        ).length,
        color: 'bg-indigo-500'
      },
      {
        stage: 'Follow-up Queue',
        count: leads.filter((l) => l.stage === 'Follow-up Required' || l.stage === 'Future Follow-up').length,
        color: 'bg-amber-500'
      },
      {
        stage: 'Admission Confirmed',
        count: leads.filter((l) => l.stage === 'Admission Confirmed').length,
        color: 'bg-emerald-500'
      },
      {
        stage: 'Not Interested / Lost',
        count: leads.filter((l) => l.stage === 'Not Interested' || l.stage === 'Lost').length,
        color: 'bg-slate-400'
      }
    ];
    const maxCount = Math.max(1, ...stages.map((s) => s.count));
    return stages.map((s) => ({
      ...s,
      pctOfMax: Math.round((s.count / maxCount) * 100),
      pctOfTotal: leads.length > 0 ? Math.round((s.count / leads.length) * 100) : 0
    }));
  }, [leads]);

  // Low Attendance Watchlist (<75%) from Record<string, AttendanceSession>
  const lowAttendanceWatchlist = useMemo(() => {
    const attendanceObj = state.attendance || {};
    const sessionList = Object.values(attendanceObj);
    if (sessionList.length === 0) return [];

    const statsMap = new Map<string, { present: number; total: number }>();
    sessionList.forEach((session) => {
      if (!session || session.sessionStatus === 'Cancelled' || !session.records) return;
      Object.entries(session.records).forEach(([studentId, rec]) => {
        if (!rec || rec.status === 'Not Marked') return;
        if (state.excusedLeaveExcludedFromTotal && rec.status === 'Excused Leave') return;
        const curr = statsMap.get(studentId) || { present: 0, total: 0 };
        curr.total += 1;
        if (rec.status === 'Present' || rec.status === 'Late') curr.present += 1;
        statsMap.set(studentId, curr);
      });
    });

    const alerts: Array<{ student: Student; pct: number; present: number; total: number }> = [];
    filteredStudents.forEach((s) => {
      const stat = statsMap.get(s.id);
      if (stat && stat.total >= 1) {
        const pct = Math.round((stat.present / stat.total) * 100);
        if (pct < 75) {
          alerts.push({ student: s, pct, present: stat.present, total: stat.total });
        }
      }
    });

    return alerts.sort((a, b) => a.pct - b.pct);
  }, [state.attendance, state.excusedLeaveExcludedFromTotal, filteredStudents]);

  // Recent Activity / Audit Trail
  const recentAuditTrail = useMemo(() => {
    const logs = Array.isArray(state.auditLogs) ? state.auditLogs : [];
    return logs.slice(0, 12);
  }, [state.auditLogs]);

  const getSpanClass = (span: WidgetSpan) => {
    switch (span) {
      case 4:
        return 'col-span-12 md:col-span-6 xl:col-span-4';
      case 6:
        return 'col-span-12 lg:col-span-6';
      case 8:
        return 'col-span-12 xl:col-span-8';
      case 12:
      default:
        return 'col-span-12';
    }
  };

  const renderWidgetHeaderControls = (widget: WidgetConfig, index: number) => (
    <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
      {/* Quick Size Toggle (1x Half / 2x Full + 1/3 & 2/3) */}
      <div className="hidden lg:flex items-center bg-slate-100 rounded-md p-0.5 border border-slate-200/80">
        {(
          [
            { sp: 4 as WidgetSpan, label: '1/3' },
            { sp: 6 as WidgetSpan, label: '1x Half' },
            { sp: 8 as WidgetSpan, label: '2/3' },
            { sp: 12 as WidgetSpan, label: '2x Full' }
          ]
        ).map(({ sp, label }) => (
          <button
            key={sp}
            type="button"
            onClick={() => updateWidget(widget.id, { span: sp })}
            title={`Resize widget width to ${label}`}
            className={`px-1.5 py-0.5 text-[9px] font-extrabold rounded transition-colors cursor-pointer ${
              widget.span === sp
                ? 'bg-slate-900 text-white shadow-2xs'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Height Density Toggle */}
      {widget.id !== 'kpi_strip' && (
        <button
          type="button"
          onClick={() => updateWidget(widget.id, { expandedHeight: !widget.expandedHeight })}
          title={widget.expandedHeight ? 'Switch to Compact Height' : 'Expand Widget Scroll Area'}
          className="p-1 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
        >
          {widget.expandedHeight ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
        </button>
      )}

      {/* Move Up / Down (Touch & Keyboard Accessible Reordering) */}
      <button
        type="button"
        disabled={index === 0}
        onClick={() => moveWidget(widget.id, 'up')}
        title="Move Widget Up"
        className="p-1 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 disabled:opacity-30 transition-colors cursor-pointer"
      >
        <ChevronUp className="w-3.5 h-3.5" />
      </button>
      <button
        type="button"
        disabled={index === widgets.length - 1}
        onClick={() => moveWidget(widget.id, 'down')}
        title="Move Widget Down"
        className="p-1 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 disabled:opacity-30 transition-colors cursor-pointer"
      >
        <ChevronDown className="w-3.5 h-3.5" />
      </button>

      {/* Collapse / Expand Chevron */}
      <button
        type="button"
        onClick={() => updateWidget(widget.id, { collapsed: !widget.collapsed })}
        title={widget.collapsed ? 'Expand Widget Body' : 'Collapse Widget to Header'}
        className="px-1.5 py-0.5 rounded-md text-[10px] font-black text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors cursor-pointer"
      >
        {widget.collapsed ? '+' : '−'}
      </button>

      {/* Hide Widget Eye Icon */}
      <button
        type="button"
        onClick={() => updateWidget(widget.id, { visible: false })}
        title="Hide Widget (Restore via Customize Layout Button)"
        className="p-1 rounded-md text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
      >
        <EyeOff className="w-3.5 h-3.5" />
      </button>
    </div>
  );

  const renderDragHandle = (widgetId: WidgetId) => (
    <div
      onMouseDown={() => setDragReadyId(widgetId)}
      onMouseUp={() => setDragReadyId(null)}
      onTouchStart={() => setDragReadyId(widgetId)}
      onTouchEnd={() => setDragReadyId(null)}
      title="Drag handle to reorder widget"
      className="p-1 -ml-1 rounded hover:bg-slate-200/70 text-slate-400 hover:text-slate-700 cursor-grab active:cursor-grabbing shrink-0"
    >
      <GripVertical className="w-3.5 h-3.5" />
    </div>
  );

  const renderBottomRightResizeGrip = (widget: WidgetConfig) => (
    <div
      onMouseDown={(e) => handleStartWidgetCornerResize(e, widget)}
      title="Drag corner horizontally to resize widget column width"
      className="hidden lg:flex items-center justify-center w-4 h-4 absolute bottom-1 right-1 cursor-nwse-resize text-slate-300 hover:text-blue-600 z-20 select-none"
    >
      <svg viewBox="0 0 12 12" className="w-3 h-3 fill-current">
        <path d="M10 2L2 10M10 6L6 10M10 10H10.01" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    </div>
  );

  const hiddenCount = widgets.filter((w) => !w.visible).length;

  return (
    <div className="space-y-3 pb-4 w-full max-w-full min-w-0 overflow-x-hidden">
      {/* COMPACT EXECUTIVE COMMAND BAR */}
      <div className="bg-gradient-to-r from-[#0B1120] via-[#0F172A] to-[#1E293B] rounded-xl p-3 sm:p-3.5 text-white shadow-sm border border-slate-800/80 relative min-w-0 max-w-full">
        <div className="relative z-10 flex flex-col xl:flex-row xl:items-center justify-between gap-2.5 min-w-0">
          {/* Left Identity + Live Status */}
          <div className="space-y-0.5 min-w-0">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-[10px] font-extrabold uppercase tracking-wider">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Live Executive Command Center
              </span>
              {state.lastCloudSyncAt && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white/5 border border-white/10 text-slate-300 text-[10px] font-medium">
                  <Database className="w-3 h-3 text-emerald-400 shrink-0" />
                  Synced: {new Date(state.lastCloudSyncAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              )}
              <span className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-500/10 border border-amber-400/20 text-amber-300 text-[10px] font-bold">
                Drag <GripVertical className="w-2.5 h-2.5 inline" /> handle or resize any widget
              </span>
            </div>
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 min-w-0">
              <h1 className="text-base sm:text-lg font-black tracking-tight text-white leading-tight truncate">
                {state.settings?.instituteName || 'Srujaan Share Market Institute'}
              </h1>
              <p className="text-[11px] text-slate-400 font-medium truncate">
                Interactive Admissions, Fee Recovery, Batch Capacity & Lead Funnel
              </p>
            </div>
          </div>

          {/* Right Global Search + Quick Action Bar */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-1.5 w-full xl:w-auto shrink-0 min-w-0">
            {/* Instant Global Search */}
            <div className="relative flex-1 sm:w-60 min-w-0">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                id="dashboard-global-search"
                type="text"
                value={globalSearch}
                onChange={(e) => setGlobalSearch(e.target.value)}
                placeholder="Search student, ID, phone, lead..."
                className="w-full min-h-[40px] pl-8 pr-7 py-1.5 bg-slate-900/90 border border-slate-700/80 rounded-lg text-xs text-white placeholder-slate-400 focus:outline-none focus:border-amber-400 transition-all"
              />
              {globalSearch && (
                <button
                  type="button"
                  onClick={() => setGlobalSearch('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-slate-400 hover:text-white px-1 cursor-pointer"
                >
                  ✕
                </button>
              )}

              {/* Instant Search Dropdown */}
              {globalSearch.trim().length > 0 && (
                <div className="absolute left-0 right-0 mt-1.5 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl z-50 max-h-72 overflow-y-auto divide-y divide-slate-800">
                  {searchResults.students.length === 0 && searchResults.leads.length === 0 ? (
                    <div className="p-3 text-center text-xs text-slate-400">
                      No matching students or leads for "{globalSearch}"
                    </div>
                  ) : (
                    <>
                      {searchResults.students.length > 0 && (
                        <div className="p-1.5">
                          <div className="text-[9px] font-black uppercase tracking-wider text-slate-400 px-2 py-1">
                            Students ({searchResults.students.length})
                          </div>
                          {searchResults.students.map((s) => {
                            const { pending } = getStudentFeeStats(s);
                            return (
                              <div
                                key={s.id}
                                onClick={() => {
                                  setGlobalSearch('');
                                  if (pending > 0) {
                                    onOpenFeeModal(s.id);
                                  } else {
                                    onOpenStudentModal(s.id);
                                  }
                                }}
                                className="flex items-center justify-between px-2.5 py-1.5 hover:bg-slate-800/80 rounded-lg cursor-pointer transition-colors"
                              >
                                <div className="min-w-0 pr-2">
                                  <div className="text-xs font-bold text-white truncate">
                                    {s.name} <span className="text-[10px] text-slate-400 font-mono">({s.regId})</span>
                                  </div>
                                  <div className="text-[10px] text-slate-400 truncate">
                                    {s.phone} • {s.course}
                                  </div>
                                </div>
                                <span
                                  className={`text-[10px] font-extrabold px-1.5 py-0.5 rounded shrink-0 ${
                                    pending > 0 ? 'bg-rose-500/20 text-rose-300' : 'bg-emerald-500/20 text-emerald-300'
                                  }`}
                                >
                                  {pending > 0 ? `Due ${currency}${pending.toLocaleString('en-IN')}` : 'Paid'}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      )}
                      {searchResults.leads.length > 0 && (
                        <div className="p-1.5">
                          <div className="text-[9px] font-black uppercase tracking-wider text-slate-400 px-2 py-1">
                            Leads ({searchResults.leads.length})
                          </div>
                          {searchResults.leads.map((l) => (
                            <div
                              key={l.id}
                              onClick={() => {
                                setGlobalSearch('');
                                onOpenLeadModal(l.id);
                              }}
                              className="flex items-center justify-between px-2.5 py-1.5 hover:bg-slate-800/80 rounded-lg cursor-pointer transition-colors"
                            >
                              <div className="min-w-0 pr-2">
                                <div className="text-xs font-bold text-white truncate">{l.name}</div>
                                <div className="text-[10px] text-slate-400 truncate">
                                  {l.phone} • {l.course}
                                </div>
                              </div>
                              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 shrink-0">
                                {l.stage}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>

            {/* Action Buttons (Touch target >= 40px) */}
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => onOpenStudentModal()}
                className="flex-1 sm:flex-initial min-h-[40px] inline-flex items-center justify-center gap-1 px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs rounded-lg shadow-2xs transition-all cursor-pointer whitespace-nowrap"
              >
                <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
                <span>Add Student</span>
              </button>

              <button
                type="button"
                onClick={() => onOpenLeadModal()}
                className="flex-1 sm:flex-initial min-h-[40px] inline-flex items-center justify-center gap-1 px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-white border border-slate-700 font-bold text-xs rounded-lg transition-all cursor-pointer whitespace-nowrap"
              >
                <UserPlus className="w-3.5 h-3.5 text-amber-400" />
                <span>+ Lead ({metrics.activeLeads})</span>
              </button>

              <button
                type="button"
                onClick={onOpenGoogleSheetsExport}
                className="min-h-[40px] inline-flex items-center justify-center gap-1 px-2.5 py-1.5 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/30 font-bold text-xs rounded-lg transition-all cursor-pointer whitespace-nowrap"
                title="Export or Sync with Google Sheets"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                <span className="hidden md:inline">Sheets</span>
              </button>

              <button
                type="button"
                onClick={() => setShowLayoutCustomizer((prev) => !prev)}
                className={`min-h-[40px] inline-flex items-center justify-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold border transition-all cursor-pointer whitespace-nowrap ${
                  showLayoutCustomizer || hiddenCount > 0
                    ? 'bg-indigo-500 text-white border-indigo-400'
                    : 'bg-slate-800/90 text-slate-200 border-slate-700 hover:bg-slate-700'
                }`}
                title="Customize Dashboard Layout, Hidden Widgets & Column Widths"
              >
                <SlidersHorizontal className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Customize Layout</span>
                {hiddenCount > 0 && (
                  <span className="px-1 py-0.2 bg-white/20 rounded text-[10px] font-black">{hiddenCount}</span>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* COMPACT FILTER & QUICK MODULE STRIP */}
        <div className="relative z-10 mt-2 pt-2 border-t border-slate-800/90 flex flex-wrap items-center justify-between gap-2 min-w-0">
          <div className="flex flex-wrap items-center gap-1.5 min-w-0">
            <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 mr-0.5">
              <Filter className="w-3 h-3 text-amber-400" /> Filters:
            </span>

            <select
              value={courseFilter}
              onChange={(e) => setCourseFilter(e.target.value)}
              className="bg-slate-900/90 border border-slate-700 text-slate-200 text-[11px] font-semibold rounded-md px-2 py-1 focus:outline-none focus:border-amber-400 cursor-pointer max-w-[200px] truncate"
            >
              <option value="ALL">All Courses ({students.length})</option>
              {uniqueCourses.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>

            <div className="flex items-center bg-slate-900/90 border border-slate-700 rounded-md p-0.5">
              {[
                { id: 'ALL', label: 'All Time' },
                { id: 'THIS_MONTH', label: 'Month' },
                { id: '30_DAYS', label: '30d' },
                { id: '90_DAYS', label: '90d' }
              ].map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setDateRangeFilter(tab.id as any)}
                  className={`px-2 py-0.5 rounded text-[10px] font-bold transition-colors cursor-pointer ${
                    dateRangeFilter === tab.id
                      ? 'bg-amber-500 text-slate-950'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {(courseFilter !== 'ALL' || dateRangeFilter !== 'ALL') && (
              <button
                type="button"
                onClick={() => {
                  setCourseFilter('ALL');
                  setDateRangeFilter('ALL');
                }}
                className="text-[10px] font-bold text-amber-400 hover:text-amber-300 underline ml-1 cursor-pointer"
              >
                Reset ({filteredStudents.length}/{students.length})
              </button>
            )}
          </div>

          {/* Horizontally Scrollable Quick Module Pills */}
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar max-w-full">
            {onOpenManualEntry && (
              <button
                type="button"
                onClick={onOpenManualEntry}
                className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-white/5 hover:bg-white/10 text-slate-300 text-[10px] font-bold transition-colors cursor-pointer shrink-0"
              >
                <Plus className="w-3 h-3 text-emerald-400" /> Fast Entry
              </button>
            )}
            <button
              type="button"
              onClick={() => onNavigate('attendance')}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-white/5 hover:bg-white/10 text-slate-300 text-[10px] font-bold transition-colors cursor-pointer shrink-0"
            >
              <Calendar className="w-3 h-3 text-sky-400" /> Attendance
            </button>
            <button
              type="button"
              onClick={() => onNavigate('workspace')}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-white/5 hover:bg-white/10 text-slate-300 text-[10px] font-bold transition-colors cursor-pointer shrink-0"
            >
              <Cloud className="w-3 h-3 text-emerald-400" /> Workspace & Docs
            </button>
            {onOpenCloudIntegrations && (
              <button
                type="button"
                onClick={onOpenCloudIntegrations}
                className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-white/5 hover:bg-white/10 text-slate-300 text-[10px] font-bold transition-colors cursor-pointer shrink-0"
              >
                <Database className="w-3 h-3 text-indigo-400" /> Cloud DB
              </button>
            )}
            <button
              type="button"
              onClick={onOpenAiDrawer}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/30 text-[10px] font-bold transition-colors cursor-pointer shrink-0"
            >
              <Sparkles className="w-3 h-3 text-amber-400" /> AI Copilot
            </button>
          </div>
        </div>

        {/* EXPANDABLE LAYOUT CUSTOMIZER DRAWER */}
        {showLayoutCustomizer && (
          <div className="relative z-10 mt-2 pt-2 border-t border-slate-700/80 bg-slate-900/95 rounded-lg p-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[10px] font-black uppercase tracking-wider text-indigo-300 mr-1 flex items-center gap-1">
                <LayoutGrid className="w-3 h-3" /> Show / Hide Widgets:
              </span>
              {widgets.map((w) => (
                <button
                  key={w.id}
                  type="button"
                  onClick={() => updateWidget(w.id, { visible: !w.visible, collapsed: false })}
                  className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-bold border transition-all cursor-pointer ${
                    w.visible
                      ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-200'
                      : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white'
                  }`}
                >
                  {w.visible ? <Eye className="w-3 h-3 text-emerald-400" /> : <EyeOff className="w-3 h-3" />}
                  {w.title}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={resetLayout}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/30 text-rose-200 text-[10px] font-black uppercase tracking-wider shrink-0 cursor-pointer self-end sm:self-auto"
            >
              <RotateCcw className="w-3 h-3" /> Reset Default Layout
            </button>
          </div>
        )}
      </div>

      {/* DYNAMIC REORDERABLE & RESIZABLE 12-COLUMN WIDGET GRID */}
      <div className="grid grid-cols-12 gap-3 items-start min-w-0 max-w-full">
        {widgets.map((widget, idx) => {
          if (!widget.visible) return null;

          const isDragOver = dragOverWidgetId === widget.id && draggedWidgetId !== widget.id;

          return (
            <div
              key={widget.id}
              draggable={dragReadyId === widget.id}
              onDragStart={(e) => {
                if (dragReadyId !== widget.id) {
                  e.preventDefault();
                  return;
                }
                setDraggedWidgetId(widget.id);
              }}
              onDragOver={(e) => {
                e.preventDefault();
                if (dragOverWidgetId !== widget.id) setDragOverWidgetId(widget.id);
              }}
              onDrop={() => handleWidgetDrop(widget.id)}
              onDragEnd={() => {
                setDraggedWidgetId(null);
                setDragOverWidgetId(null);
                setDragReadyId(null);
              }}
              className={`${getSpanClass(widget.span)} min-w-0 max-w-full relative transition-all duration-200 ${
                isDragOver ? 'ring-2 ring-amber-500 ring-offset-1 rounded-xl scale-[0.995]' : ''
              }`}
            >
              {/* WIDGET 1: KPI STRIP */}
              {widget.id === 'kpi_strip' && (
                <div className="bg-white rounded-xl border border-slate-200/90 shadow-2xs overflow-hidden relative min-w-0 max-w-full">
                  <div className="px-3.5 py-2 bg-slate-50/80 border-b border-slate-100 flex items-center justify-between gap-2 min-w-0">
                    <div className="flex items-center gap-1.5 min-w-0">
                      {renderDragHandle(widget.id)}
                      <span className="text-[11px] font-black uppercase tracking-wider text-slate-700 truncate">
                        {widget.title}
                      </span>
                    </div>
                    {renderWidgetHeaderControls(widget, idx)}
                  </div>

                  {!widget.collapsed && (
                    <div className="p-3.5 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 min-w-0">
                      {/* Card 1: Students */}
                      <div
                        onClick={() => onNavigate('students')}
                        className="bg-slate-50/70 hover:bg-blue-50/50 rounded-xl p-3.5 border border-slate-200/80 hover:border-blue-300 transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md cursor-pointer group flex flex-col justify-between min-w-0"
                      >
                        <div className="flex items-start justify-between gap-2 min-w-0">
                          <div className="min-w-0">
                            <p className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 truncate">
                              Active Students
                            </p>
                            <h2 className="text-xl sm:text-2xl font-black text-slate-900 mt-0.5 tracking-tight">
                              {metrics.totalStudents}
                            </h2>
                          </div>
                          <div className="w-8 h-8 rounded-lg bg-blue-500/10 text-blue-600 flex items-center justify-center group-hover:bg-blue-600 group-hover:text-white transition-colors shrink-0">
                            <Users className="w-4 h-4" />
                          </div>
                        </div>
                        <div className="mt-2 pt-2 border-t border-slate-200/60 flex items-center justify-between text-[11px]">
                          <span className="text-slate-500 font-medium">
                            Batches: <strong className="text-slate-800">{batches.length}</strong>
                          </span>
                          <span className="text-blue-600 font-bold inline-flex items-center gap-0.5">
                            Directory <ArrowUpRight className="w-3 h-3" />
                          </span>
                        </div>
                      </div>

                      {/* Card 2: Fee Realization */}
                      <div
                        onClick={() => onNavigate('fees')}
                        className="bg-slate-50/70 hover:bg-emerald-50/50 rounded-xl p-3.5 border border-slate-200/80 hover:border-emerald-300 transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md cursor-pointer group flex flex-col justify-between min-w-0"
                      >
                        <div className="flex items-start justify-between gap-2 min-w-0">
                          <div className="min-w-0">
                            <p className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 truncate">
                              Fee Realization
                            </p>
                            <h2 className="text-xl sm:text-2xl font-black text-emerald-600 mt-0.5 tracking-tight truncate">
                              {currency}
                              {metrics.totalPaidFees.toLocaleString('en-IN')}
                            </h2>
                          </div>
                          <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-600 flex items-center justify-center group-hover:bg-emerald-600 group-hover:text-white transition-colors shrink-0">
                            <IndianRupee className="w-4 h-4" />
                          </div>
                        </div>
                        <div className="mt-2">
                          <div className="flex items-center justify-between text-[10px] font-bold mb-1">
                            <span className="text-slate-500">Collected ({metrics.collectionRate}%)</span>
                            <span className="text-slate-700 truncate">
                              of {currency}
                              {metrics.totalContractedFees.toLocaleString('en-IN')}
                            </span>
                          </div>
                          <div className="w-full h-1.5 bg-slate-200 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-emerald-500 rounded-full transition-all duration-500"
                              style={{ width: `${Math.min(100, metrics.collectionRate)}%` }}
                            />
                          </div>
                        </div>
                      </div>

                      {/* Card 3: Pending Dues */}
                      <div
                        onClick={() => onNavigate('fees')}
                        className="bg-slate-50/70 hover:bg-rose-50/50 rounded-xl p-3.5 border border-slate-200/80 hover:border-rose-300 transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md cursor-pointer group flex flex-col justify-between min-w-0"
                      >
                        <div className="flex items-start justify-between gap-2 min-w-0">
                          <div className="min-w-0">
                            <p className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 truncate">
                              Pending Recovery
                            </p>
                            <h2 className="text-xl sm:text-2xl font-black text-rose-600 mt-0.5 tracking-tight truncate">
                              {currency}
                              {metrics.totalPendingFees.toLocaleString('en-IN')}
                            </h2>
                          </div>
                          <div className="w-8 h-8 rounded-lg bg-rose-500/10 text-rose-600 flex items-center justify-center group-hover:bg-rose-600 group-hover:text-white transition-colors shrink-0">
                            <AlertCircle className="w-4 h-4" />
                          </div>
                        </div>
                        <div className="mt-2 pt-2 border-t border-slate-200/60 flex items-center justify-between text-[10px] font-bold">
                          <span className="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700">
                            {metrics.paidCount} Paid
                          </span>
                          <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">
                            {metrics.partialCount} Part
                          </span>
                          <span className="px-1.5 py-0.5 rounded bg-rose-100 text-rose-700">
                            {metrics.unpaidCount} Unpaid
                          </span>
                        </div>
                      </div>

                      {/* Card 4: Lead Pipeline */}
                      <div
                        onClick={() => onNavigate('leads')}
                        className="bg-slate-50/70 hover:bg-amber-50/50 rounded-xl p-3.5 border border-slate-200/80 hover:border-amber-300 transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md cursor-pointer group flex flex-col justify-between min-w-0"
                      >
                        <div className="flex items-start justify-between gap-2 min-w-0">
                          <div className="min-w-0">
                            <p className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 truncate">
                              Lead Conversion
                            </p>
                            <div className="flex items-baseline gap-1.5 mt-0.5">
                              <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                                {metrics.conversionRate}%
                              </h2>
                              <span className="text-[10px] font-bold text-amber-600">
                                ({metrics.convertedLeads}/{metrics.totalLeads})
                              </span>
                            </div>
                          </div>
                          <div className="w-8 h-8 rounded-lg bg-amber-500/10 text-amber-600 flex items-center justify-center group-hover:bg-amber-500 group-hover:text-white transition-colors shrink-0">
                            <TrendingUp className="w-4 h-4" />
                          </div>
                        </div>
                        <div className="mt-2 pt-2 border-t border-slate-200/60 flex items-center justify-between text-[11px]">
                          <span className="text-slate-500 font-medium inline-flex items-center gap-1">
                            <Flame className="w-3 h-3 text-rose-500" /> Hot:{' '}
                            <strong className="text-rose-600">{metrics.hotLeads}</strong>
                          </span>
                          <span className="text-slate-500 font-medium inline-flex items-center gap-1">
                            <Award className="w-3 h-3 text-indigo-500" /> Certs:{' '}
                            <strong className="text-slate-800">{metrics.certifiedCount}</strong>
                          </span>
                        </div>
                      </div>
                    </div>
                  )}
                  {renderBottomRightResizeGrip(widget)}
                </div>
              )}

              {/* WIDGET 2: INTERACTIVE VISUAL ANALYTICS CHART */}
              {widget.id === 'interactive_analytics' && (
                <div
                  ref={chartContainerRef}
                  className="bg-white rounded-xl border border-slate-200/90 shadow-2xs overflow-hidden relative min-w-0 max-w-full"
                >
                  <div className="px-3.5 py-2 bg-slate-50/80 border-b border-slate-100 flex flex-wrap items-center justify-between gap-2 min-w-0">
                    <div className="flex items-center gap-2 min-w-0">
                      {renderDragHandle(widget.id)}
                      <PieChart className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                      <span className="text-[11px] font-black uppercase tracking-wider text-slate-800 truncate">
                        {widget.title}
                      </span>
                      <div className="flex items-center bg-slate-200/70 rounded-lg p-0.5 ml-1">
                        {[
                          { id: 'cashflow', label: 'Course Cashflow' },
                          { id: 'batches', label: 'Batch Occupancy' },
                          { id: 'funnel', label: 'Lead Funnel' }
                        ].map((tab) => (
                          <button
                            key={tab.id}
                            type="button"
                            onClick={() => {
                              setAnalyticsMode(tab.id as any);
                              setActiveChartTooltip(null);
                            }}
                            className={`px-2 py-0.5 rounded-md text-[10px] font-extrabold transition-all cursor-pointer ${
                              analyticsMode === tab.id
                                ? 'bg-white text-slate-900 shadow-2xs'
                                : 'text-slate-600 hover:text-slate-900'
                            }`}
                          >
                            {tab.label}
                          </button>
                        ))}
                      </div>
                    </div>
                    {renderWidgetHeaderControls(widget, idx)}
                  </div>

                  {!widget.collapsed && (
                    <div className="p-3.5 min-w-0 max-w-full">
                      {/* Dynamic Interactive Tooltip Banner */}
                      <div className="mb-2.5 px-3 py-1.5 rounded-lg bg-slate-900 text-white flex flex-wrap items-center justify-between gap-2 text-xs min-w-0">
                        {activeChartTooltip ? (
                          <>
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0" />
                              <strong className="font-black text-amber-300 truncate">{activeChartTooltip.label}</strong>
                              <span className="text-slate-300 truncate">{activeChartTooltip.primary}</span>
                            </div>
                            <div className="flex items-center gap-3 text-[11px]">
                              <span className="text-emerald-300 font-bold">{activeChartTooltip.secondary}</span>
                              {activeChartTooltip.accent && (
                                <span className="px-2 py-0.5 rounded bg-white/10 text-white font-bold">
                                  {activeChartTooltip.accent}
                                </span>
                              )}
                            </div>
                          </>
                        ) : (
                          <div className="flex flex-wrap items-center justify-between w-full text-[11px] text-slate-300 gap-2">
                            <span className="truncate">
                              Hover or tap any bar to inspect live metrics (Canvas: {chartDimensions.width}px)
                            </span>
                            <span className="text-emerald-400 font-bold shrink-0">
                              Realized: {metrics.collectionRate}% ({currency}
                              {metrics.totalPaidFees.toLocaleString('en-IN')})
                            </span>
                          </div>
                        )}
                      </div>

                      {/* MODE 1: COURSE CASHFLOW BREAKDOWN */}
                      {analyticsMode === 'cashflow' && (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5 min-w-0">
                          {courseCashflowData.length === 0 ? (
                            <div className="col-span-full py-5 text-center text-xs text-slate-400">
                              No course fee records match the active filter.
                            </div>
                          ) : (
                            courseCashflowData.map((item) => {
                              const total = item.collected + item.pending;
                              const paidPct = total > 0 ? Math.round((item.collected / total) * 100) : 0;
                              return (
                                <div
                                  key={item.course}
                                  onMouseEnter={() =>
                                    setActiveChartTooltip({
                                      label: item.course,
                                      primary: `${item.count} Enrolled Students`,
                                      secondary: `Collected: ${currency}${item.collected.toLocaleString('en-IN')}`,
                                      accent: `Pending: ${currency}${item.pending.toLocaleString('en-IN')} (${paidPct}% Realized)`
                                    })
                                  }
                                  onClick={() =>
                                    setCourseFilter((prev) => (prev === item.course ? 'ALL' : item.course))
                                  }
                                  className={`p-3 rounded-lg border transition-all cursor-pointer min-w-0 ${
                                    courseFilter === item.course
                                      ? 'bg-indigo-50/70 border-indigo-400 ring-1 ring-indigo-300'
                                      : 'bg-slate-50/70 hover:bg-slate-100/80 border-slate-200/80'
                                  }`}
                                >
                                  <div className="flex items-center justify-between gap-2 mb-1.5 min-w-0">
                                    <CourseBadgePill course={item.course} />
                                    <span className="text-[10px] font-black text-slate-600 shrink-0">
                                      {item.count} {item.count === 1 ? 'Student' : 'Students'}
                                    </span>
                                  </div>
                                  <div className="flex items-baseline justify-between text-xs mb-1">
                                    <span className="font-black text-emerald-700">
                                      {currency}
                                      {item.collected.toLocaleString('en-IN')}
                                    </span>
                                    <span className="text-[10px] font-bold text-rose-600">
                                      Due: {currency}
                                      {item.pending.toLocaleString('en-IN')}
                                    </span>
                                  </div>
                                  <div className="w-full h-2 bg-rose-100 rounded-full overflow-hidden flex">
                                    <div
                                      className="h-full bg-emerald-500 transition-all duration-500"
                                      style={{ width: `${paidPct}%` }}
                                    />
                                  </div>
                                </div>
                              );
                            })
                          )}
                        </div>
                      )}

                      {/* MODE 2: BATCH REVENUE & OCCUPANCY CHART */}
                      {analyticsMode === 'batches' && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 min-w-0">
                          {batchSummaries.length === 0 ? (
                            <div className="col-span-full py-5 text-center text-xs text-slate-400">
                              No active batches configured.
                            </div>
                          ) : (
                            batchSummaries.map(({ batch, enrolledCount, capacity, fillPct, collected, pending }) => (
                              <div
                                key={batch.code}
                                onMouseEnter={() =>
                                  setActiveChartTooltip({
                                    label: `${batch.name} (${batch.code})`,
                                    primary: `Occupancy: ${enrolledCount}/${capacity} seats (${fillPct}%)`,
                                    secondary: `Collected: ${currency}${collected.toLocaleString('en-IN')}`,
                                    accent: `Pending: ${currency}${pending.toLocaleString('en-IN')}`
                                  })
                                }
                                onClick={() => onNavigate('batches')}
                                className="p-3 rounded-lg border border-slate-200/80 bg-slate-50/70 hover:border-indigo-300 hover:bg-indigo-50/30 transition-all cursor-pointer min-w-0"
                              >
                                <div className="flex items-center justify-between gap-1 mb-1 min-w-0">
                                  <span className="text-xs font-black text-slate-900 truncate">{batch.name}</span>
                                  <span className="text-[10px] font-extrabold px-1.5 py-0.5 rounded bg-slate-200 text-slate-800 shrink-0">
                                    {enrolledCount}/{capacity}
                                  </span>
                                </div>
                                <div className="text-[10px] text-slate-500 truncate mb-1.5">
                                  {batch.schedule || 'Flexible'} • {batch.instructor}
                                </div>
                                <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden mb-1.5">
                                  <div
                                    className={`h-full rounded-full ${
                                      fillPct >= 90 ? 'bg-rose-500' : fillPct >= 65 ? 'bg-amber-500' : 'bg-indigo-600'
                                    }`}
                                    style={{ width: `${fillPct}%` }}
                                  />
                                </div>
                                <div className="flex items-center justify-between text-[10px] font-bold">
                                  <span className="text-emerald-700">
                                    {currency}
                                    {collected.toLocaleString('en-IN')}
                                  </span>
                                  <span className="text-rose-600">
                                    Due {currency}
                                    {pending.toLocaleString('en-IN')}
                                  </span>
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                      )}

                      {/* MODE 3: LEAD CONVERSION FUNNEL */}
                      {analyticsMode === 'funnel' && (
                        <div className="space-y-1.5 min-w-0">
                          {leadFunnelData.map((item) => (
                            <div
                              key={item.stage}
                              onMouseEnter={() =>
                                setActiveChartTooltip({
                                  label: item.stage,
                                  primary: `${item.count} Leads`,
                                  secondary: `${item.pctOfTotal}% of Total Inquiries (${leads.length})`,
                                  accent: 'Click to open Lead CRM'
                                })
                              }
                              onClick={() => onNavigate('leads')}
                              className="flex items-center gap-3 p-2 rounded-lg bg-slate-50/80 hover:bg-slate-100 border border-slate-200/70 cursor-pointer transition-colors min-w-0"
                            >
                              <div className="w-32 sm:w-40 shrink-0 min-w-0">
                                <div className="text-xs font-extrabold text-slate-800 truncate">{item.stage}</div>
                                <div className="text-[10px] text-slate-500">{item.pctOfTotal}% of pipeline</div>
                              </div>
                              <div className="flex-1 h-4 bg-slate-200/80 rounded-md overflow-hidden min-w-0">
                                <div
                                  className={`h-full ${item.color} transition-all duration-500`}
                                  style={{ width: `${Math.max(5, item.pctOfMax)}%` }}
                                />
                              </div>
                              <div className="w-10 text-right text-xs font-black text-slate-900 shrink-0">
                                {item.count}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                  {renderBottomRightResizeGrip(widget)}
                </div>
              )}

              {/* WIDGET 3: FEE RECOVERY & MILESTONE DUES */}
              {widget.id === 'overdue_fees' && (
                <div className="bg-white rounded-xl border border-slate-200/90 shadow-2xs overflow-hidden flex flex-col relative min-w-0 max-w-full">
                  <div className="px-3.5 py-2 bg-slate-50/80 border-b border-slate-100 flex flex-wrap items-center justify-between gap-2 min-w-0">
                    <div className="flex items-center gap-2 min-w-0">
                      {renderDragHandle(widget.id)}
                      <div className="w-5 h-5 rounded-md bg-rose-500/10 text-rose-600 flex items-center justify-center shrink-0">
                        <IndianRupee className="w-3 h-3" />
                      </div>
                      <h3 className="text-xs font-black text-slate-900 truncate">
                        {widget.title} ({pendingFeeStudents.length})
                      </h3>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => onNavigate('fees')}
                        className="text-[11px] font-bold text-indigo-600 hover:text-indigo-700 inline-flex items-center gap-0.5 cursor-pointer mr-1"
                      >
                        Full Ledger <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                      {renderWidgetHeaderControls(widget, idx)}
                    </div>
                  </div>

                  {!widget.collapsed && (
                    <>
                      {pendingFeeStudents.length === 0 ? (
                        <div className="p-6 text-center">
                          <CheckCircle2 className="w-7 h-7 text-emerald-500 mx-auto mb-1.5" />
                          <p className="text-xs font-bold text-slate-800">100% Fees Realized!</p>
                          <p className="text-[11px] text-slate-500 mt-0.5">
                            No students have pending dues in this view.
                          </p>
                        </div>
                      ) : (
                        <>
                          {/* Desktop Independent Scrollable Table with Sticky Header */}
                          <div
                            className={`hidden md:block overflow-x-auto overflow-y-auto min-w-0 max-w-full ${
                              widget.expandedHeight ? 'max-h-[65dvh]' : 'max-h-[320px]'
                            }`}
                          >
                            <table className="w-full text-left border-collapse">
                              <thead className="sticky top-0 bg-slate-50/95 backdrop-blur-xs z-10">
                                <tr className="border-b border-slate-200 text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
                                  <th className="py-2 px-3">Student</th>
                                  <th className="py-2 px-2.5">Course & Batch</th>
                                  <th className="py-2 px-2.5">Paid / Net Fee</th>
                                  <th className="py-2 px-2.5">Pending Due</th>
                                  <th className="py-2 px-3 text-right">Actions</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100 text-xs">
                                {pendingFeeStudents
                                  .slice(0, 15)
                                  .map(({ student, netFee, paid, pending, overdueMilestone, nextMilestone, isOverdue }) => (
                                    <tr key={student.id} className="hover:bg-slate-50/80 transition-colors">
                                      <td className="py-2 px-3">
                                        <div
                                          onClick={() => onOpenStudentModal(student.id)}
                                          className="font-bold text-slate-900 hover:text-indigo-600 cursor-pointer"
                                        >
                                          {student.name}
                                        </div>
                                        <div className="text-[10px] text-slate-500 font-mono">
                                          {student.regId} • {student.phone}
                                        </div>
                                      </td>
                                      <td className="py-2 px-2.5">
                                        <CourseBadgePill course={student.course} />
                                        <div className="text-[10px] text-slate-500 mt-0.5">
                                          {student.batch || 'Unassigned'}
                                        </div>
                                      </td>
                                      <td className="py-2 px-2.5">
                                        <div className="font-semibold text-emerald-700">
                                          {currency}
                                          {paid.toLocaleString('en-IN')}
                                        </div>
                                        <div className="text-[10px] text-slate-400">
                                          of {currency}
                                          {netFee.toLocaleString('en-IN')}
                                        </div>
                                      </td>
                                      <td className="py-2 px-2.5">
                                        <div className="font-black text-rose-600">
                                          {currency}
                                          {pending.toLocaleString('en-IN')}
                                        </div>
                                        {isOverdue ? (
                                          <span className="inline-flex items-center gap-1 text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded bg-rose-100 text-rose-700">
                                            Overdue: {overdueMilestone?.dueDate}
                                          </span>
                                        ) : nextMilestone?.dueDate ? (
                                          <span className="text-[10px] text-amber-600 font-semibold">
                                            Due: {nextMilestone.dueDate}
                                          </span>
                                        ) : null}
                                      </td>
                                      <td className="py-2 px-3 text-right">
                                        <div className="inline-flex items-center justify-end gap-1">
                                          <button
                                            type="button"
                                            onClick={() => onOpenFeeModal(student.id)}
                                            className="px-2 py-1 bg-slate-900 hover:bg-slate-800 text-white font-bold text-[10px] rounded-md transition-colors cursor-pointer whitespace-nowrap"
                                          >
                                            + Record Fee
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() => onOpenWaStudioForContact('student', student.id)}
                                            title="Open WhatsApp Reminder Studio"
                                            className="p-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-md border border-emerald-200 transition-colors cursor-pointer"
                                          >
                                            <MessageCircle className="w-3.5 h-3.5" />
                                          </button>
                                          <a
                                            href={`tel:${student.phone}`}
                                            title="Call Student"
                                            className="p-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-md transition-colors"
                                          >
                                            <Phone className="w-3.5 h-3.5" />
                                          </a>
                                        </div>
                                      </td>
                                    </tr>
                                  ))}
                              </tbody>
                            </table>
                          </div>

                          {/* Mobile Card Stack */}
                          <div
                            className={`md:hidden divide-y divide-slate-100 overflow-y-auto ${
                              widget.expandedHeight ? 'max-h-[60dvh]' : 'max-h-[290px]'
                            }`}
                          >
                            {pendingFeeStudents.slice(0, 10).map(({ student, pending, isOverdue }) => (
                              <div key={student.id} className="p-3 space-y-2">
                                <div className="flex items-start justify-between gap-2">
                                  <div className="min-w-0">
                                    <div className="font-bold text-slate-900 text-xs truncate">{student.name}</div>
                                    <div className="text-[10px] text-slate-500 truncate">
                                      {student.phone} • {student.batch || 'Unassigned'}
                                    </div>
                                  </div>
                                  <div className="text-right shrink-0">
                                    <div className="text-xs font-black text-rose-600">
                                      {currency}
                                      {pending.toLocaleString('en-IN')}
                                    </div>
                                    {isOverdue && (
                                      <span className="text-[9px] font-extrabold px-1.5 py-0.5 rounded bg-rose-100 text-rose-700">
                                        Overdue
                                      </span>
                                    )}
                                  </div>
                                </div>
                                <div className="flex items-center gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() => onOpenFeeModal(student.id)}
                                    className="flex-1 py-1.5 bg-slate-900 text-white font-bold text-[11px] rounded-md text-center cursor-pointer"
                                  >
                                    + Record Fee
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => onOpenWaStudioForContact('student', student.id)}
                                    className="px-2.5 py-1.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-md text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer"
                                  >
                                    <MessageCircle className="w-3 h-3" /> WhatsApp
                                  </button>
                                  <a
                                    href={`tel:${student.phone}`}
                                    className="p-1.5 bg-slate-100 text-slate-700 rounded-md"
                                  >
                                    <Phone className="w-3.5 h-3.5" />
                                  </a>
                                </div>
                              </div>
                            ))}
                          </div>
                        </>
                      )}
                    </>
                  )}
                  {renderBottomRightResizeGrip(widget)}
                </div>
              )}

              {/* WIDGET 4: PRIORITY LEAD FOLLOW-UPS */}
              {widget.id === 'priority_leads' && (
                <div className="bg-white rounded-xl border border-slate-200/90 shadow-2xs overflow-hidden flex flex-col relative min-w-0 max-w-full">
                  <div className="px-3.5 py-2 bg-slate-50/80 border-b border-slate-100 flex items-center justify-between gap-2 min-w-0">
                    <div className="flex items-center gap-2 min-w-0">
                      {renderDragHandle(widget.id)}
                      <div className="w-5 h-5 rounded-md bg-amber-500/10 text-amber-600 flex items-center justify-center shrink-0">
                        <Clock className="w-3 h-3" />
                      </div>
                      <h3 className="text-xs font-black text-slate-900 truncate">
                        {widget.title} ({priorityLeads.length})
                      </h3>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => onNavigate('leads')}
                        className="text-[11px] font-bold text-indigo-600 hover:text-indigo-700 inline-flex items-center gap-0.5 cursor-pointer"
                      >
                        CRM <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                      {renderWidgetHeaderControls(widget, idx)}
                    </div>
                  </div>

                  {!widget.collapsed && (
                    <div
                      className={`divide-y divide-slate-100 overflow-y-auto min-w-0 ${
                        widget.expandedHeight ? 'max-h-[65dvh]' : 'max-h-[320px]'
                      }`}
                    >
                      {priorityLeads.length === 0 ? (
                        <div className="p-6 text-center text-xs text-slate-500">
                          No pending lead follow-ups in queue.
                        </div>
                      ) : (
                        priorityLeads.slice(0, 12).map(({ lead, isDueTodayOrPast }) => (
                          <div key={lead.id} className="p-3 hover:bg-slate-50/80 transition-colors space-y-1.5 min-w-0">
                            <div className="flex items-start justify-between gap-2 min-w-0">
                              <div
                                onClick={() => onOpenLeadModal(lead.id)}
                                className="min-w-0 cursor-pointer"
                              >
                                <div className="font-bold text-slate-900 hover:text-indigo-600 text-xs truncate flex items-center gap-1">
                                  <span className="truncate">{lead.name}</span>
                                  {lead.intent === 'Hot' && (
                                    <span className="px-1 py-0.2 rounded bg-rose-100 text-rose-700 text-[9px] font-black shrink-0">
                                      HOT
                                    </span>
                                  )}
                                </div>
                                <div className="text-[10px] text-slate-500 truncate">
                                  {lead.course || 'Share Market Course'} • {lead.locality || lead.source || 'Pune'}
                                </div>
                              </div>
                              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 shrink-0">
                                {lead.stage}
                              </span>
                            </div>

                            <div className="flex items-center justify-between gap-2 pt-0.5">
                              <div className="text-[10px] truncate">
                                {lead.followUpDate ? (
                                  <span
                                    className={`font-bold ${
                                      isDueTodayOrPast ? 'text-rose-600' : 'text-slate-500'
                                    }`}
                                  >
                                    {isDueTodayOrPast ? 'Due: ' : 'Next: '}
                                    {lead.followUpDate}
                                  </span>
                                ) : (
                                  <span className="text-slate-400 font-mono">{lead.phone}</span>
                                )}
                              </div>
                              <div className="flex items-center gap-1 shrink-0">
                                <button
                                  type="button"
                                  onClick={() => onOpenLeadModal(lead.id)}
                                  className="px-2 py-0.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-[10px] font-bold cursor-pointer"
                                >
                                  Edit
                                </button>
                                <button
                                  type="button"
                                  onClick={() => onOpenWaStudioForContact('lead', lead.id)}
                                  className="px-2 py-0.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded text-[10px] font-bold inline-flex items-center gap-1 cursor-pointer"
                                >
                                  <MessageCircle className="w-2.5 h-2.5" /> WA
                                </button>
                                <a
                                  href={`tel:${lead.phone}`}
                                  className="px-1.5 py-0.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-[10px] font-bold inline-flex items-center"
                                >
                                  <Phone className="w-2.5 h-2.5" />
                                </a>
                              </div>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                  {renderBottomRightResizeGrip(widget)}
                </div>
              )}

              {/* WIDGET 5: ACTIVE BATCHES & CAPACITY */}
              {widget.id === 'active_batches' && (
                <div className="bg-white rounded-xl border border-slate-200/90 shadow-2xs overflow-hidden relative min-w-0 max-w-full">
                  <div className="px-3.5 py-2 bg-slate-50/80 border-b border-slate-100 flex items-center justify-between gap-2 min-w-0">
                    <div className="flex items-center gap-2 min-w-0">
                      {renderDragHandle(widget.id)}
                      <div className="w-5 h-5 rounded-md bg-indigo-500/10 text-indigo-600 flex items-center justify-center shrink-0">
                        <Layers className="w-3 h-3" />
                      </div>
                      <h3 className="text-xs font-black text-slate-900 truncate">
                        {widget.title} ({batchSummaries.length})
                      </h3>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => onNavigate('batches')}
                        className="text-[11px] font-bold text-indigo-600 hover:text-indigo-700 inline-flex items-center gap-0.5 cursor-pointer"
                      >
                        Batches <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                      {renderWidgetHeaderControls(widget, idx)}
                    </div>
                  </div>

                  {!widget.collapsed && (
                    <div
                      className={`p-3.5 grid grid-cols-1 sm:grid-cols-2 gap-2.5 overflow-y-auto min-w-0 ${
                        widget.expandedHeight ? 'max-h-[65dvh]' : 'max-h-[260px]'
                      }`}
                    >
                      {batchSummaries.length === 0 ? (
                        <div className="col-span-full py-6 text-center text-xs text-slate-500">
                          No active batches created yet.
                        </div>
                      ) : (
                        batchSummaries.map(({ batch, enrolledCount, capacity, fillPct, collected, pending }) => (
                          <div
                            key={batch.code}
                            onClick={() => onNavigate('batches')}
                            className="p-3 rounded-lg border border-slate-200/80 hover:border-indigo-300 hover:bg-indigo-50/20 transition-all cursor-pointer flex flex-col justify-between gap-2 min-w-0"
                          >
                            <div className="flex items-start justify-between gap-2 min-w-0">
                              <div className="min-w-0">
                                <h4 className="font-black text-slate-900 text-xs truncate">
                                  {batch.name}{' '}
                                  <span className="text-[10px] font-mono text-slate-400">({batch.code})</span>
                                </h4>
                                <p className="text-[10px] text-slate-500 truncate">
                                  {batch.schedule || 'Flexible Timing'} • {batch.instructor}
                                </p>
                              </div>
                              <span
                                className={`text-[10px] font-extrabold px-1.5 py-0.5 rounded shrink-0 ${
                                  fillPct >= 90
                                    ? 'bg-rose-100 text-rose-700'
                                    : fillPct >= 60
                                    ? 'bg-amber-100 text-amber-800'
                                    : 'bg-emerald-100 text-emerald-700'
                                }`}
                              >
                                {enrolledCount}/{capacity} Seats
                              </span>
                            </div>

                            <div>
                              <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden mb-1.5">
                                <div
                                  className={`h-full rounded-full ${
                                    fillPct >= 90
                                      ? 'bg-rose-500'
                                      : fillPct >= 60
                                      ? 'bg-amber-500'
                                      : 'bg-indigo-600'
                                  }`}
                                  style={{ width: `${fillPct}%` }}
                                />
                              </div>
                              <div className="flex items-center justify-between text-[10px] font-bold">
                                <span className="text-emerald-700">
                                  Paid: {currency}
                                  {collected.toLocaleString('en-IN')}
                                </span>
                                <span className="text-rose-600">
                                  Due: {currency}
                                  {pending.toLocaleString('en-IN')}
                                </span>
                              </div>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                  {renderBottomRightResizeGrip(widget)}
                </div>
              )}

              {/* WIDGET 6: LOW ATTENDANCE WATCHLIST */}
              {widget.id === 'attendance_watch' && (
                <div className="bg-white rounded-xl border border-slate-200/90 shadow-2xs overflow-hidden relative min-w-0 max-w-full">
                  <div className="px-3.5 py-2 bg-slate-50/80 border-b border-slate-100 flex items-center justify-between gap-2 min-w-0">
                    <div className="flex items-center gap-2 min-w-0">
                      {renderDragHandle(widget.id)}
                      <div className="w-5 h-5 rounded-md bg-rose-500/10 text-rose-600 flex items-center justify-center shrink-0">
                        <ShieldAlert className="w-3 h-3" />
                      </div>
                      <h3 className="text-xs font-black text-slate-900 truncate">
                        {widget.title} ({lowAttendanceWatchlist.length})
                      </h3>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => onNavigate('attendance')}
                        className="text-[11px] font-bold text-indigo-600 hover:text-indigo-700 cursor-pointer"
                      >
                        Mark
                      </button>
                      {renderWidgetHeaderControls(widget, idx)}
                    </div>
                  </div>

                  {!widget.collapsed && (
                    <div
                      className={`divide-y divide-slate-100 overflow-y-auto min-w-0 ${
                        widget.expandedHeight ? 'max-h-[65dvh]' : 'max-h-[260px]'
                      }`}
                    >
                      {lowAttendanceWatchlist.length === 0 ? (
                        <div className="p-6 text-center text-xs text-slate-500">
                          All tracked students maintain ≥75% attendance.
                        </div>
                      ) : (
                        lowAttendanceWatchlist.map(({ student, pct, present, total }) => (
                          <div
                            key={student.id}
                            onClick={() => onNavigate('attendance')}
                            className="px-3.5 py-2 flex items-center justify-between gap-2 hover:bg-slate-50 cursor-pointer min-w-0"
                          >
                            <div className="min-w-0">
                              <div className="text-xs font-bold text-slate-900 truncate">{student.name}</div>
                              <div className="text-[10px] text-slate-500 truncate">
                                {student.batch || student.course} • {present}/{total} sessions
                              </div>
                            </div>
                            <span className="px-2 py-0.5 rounded bg-rose-100 text-rose-700 font-black text-[11px] shrink-0">
                              {pct}%
                            </span>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                  {renderBottomRightResizeGrip(widget)}
                </div>
              )}

              {/* WIDGET 7: LIVE ACTIVITY & SYNC AUDIT TRAIL */}
              {widget.id === 'audit_trail' && (
                <div className="bg-white rounded-xl border border-slate-200/90 shadow-2xs overflow-hidden relative min-w-0 max-w-full">
                  <div className="px-3.5 py-2 bg-slate-50/80 border-b border-slate-100 flex items-center justify-between gap-2 min-w-0">
                    <div className="flex items-center gap-2 min-w-0">
                      {renderDragHandle(widget.id)}
                      <div className="w-5 h-5 rounded-md bg-slate-900 text-white flex items-center justify-center shrink-0">
                        <History className="w-3 h-3" />
                      </div>
                      <h3 className="text-xs font-black text-slate-900 truncate">{widget.title}</h3>
                    </div>
                    {renderWidgetHeaderControls(widget, idx)}
                  </div>

                  {!widget.collapsed && (
                    <div
                      className={`p-3.5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2 overflow-y-auto min-w-0 ${
                        widget.expandedHeight ? 'max-h-[55dvh]' : 'max-h-[200px]'
                      }`}
                    >
                      {recentAuditTrail.length === 0 ? (
                        <div className="col-span-full py-4 text-center text-xs text-slate-400">
                          No recent activity logged yet.
                        </div>
                      ) : (
                        recentAuditTrail.map((item) => (
                          <div
                            key={item.id}
                            className="p-2.5 rounded-lg border border-slate-100 bg-slate-50/60 flex flex-col justify-between gap-1 min-w-0"
                          >
                            <div className="flex items-center justify-between gap-1 min-w-0">
                              <span className="text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 shrink-0">
                                {item.category}
                              </span>
                              <span className="text-[9px] text-slate-400 font-mono truncate">{item.timestamp}</span>
                            </div>
                            <div className="text-[11px] font-bold text-slate-900 truncate">{item.action}</div>
                            <div className="text-[10px] text-slate-500 truncate">{item.details}</div>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                  {renderBottomRightResizeGrip(widget)}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
