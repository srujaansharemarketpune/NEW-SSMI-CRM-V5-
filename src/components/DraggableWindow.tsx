import React, { useCallback, useEffect, useRef, useState } from 'react';
import { GripHorizontal, Maximize2, Minus, RotateCcw, X } from 'lucide-react';

export interface DraggableWindowProps {
  isOpen?: boolean;
  onClose?: () => void;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  icon?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  headerActions?: React.ReactNode;
  /** 'modal' renders a full-screen z-50 backdrop; 'floating' renders without a blocking backdrop (e.g. z-40 floating widget). */
  variant?: 'modal' | 'floating';
  theme?: 'light' | 'dark';
  maxWidthClass?: string;
  zIndexClass?: string;
  backdropClassName?: string;
  panelClassName?: string;
  headerClassName?: string;
  bodyClassName?: string;
  footerClassName?: string;
  closeOnBackdropClick?: boolean;
  allowMinimize?: boolean;
  isMinimized?: boolean;
  onToggleMinimize?: () => void;
  ariaLabelledBy?: string;
  role?: 'dialog' | 'region';
}

export const DraggableWindow: React.FC<DraggableWindowProps> = ({
  isOpen = true,
  onClose,
  title,
  subtitle,
  icon,
  children,
  footer,
  headerActions,
  variant = 'modal',
  theme = 'light',
  maxWidthClass = 'max-w-2xl',
  zIndexClass,
  backdropClassName,
  panelClassName = '',
  headerClassName = '',
  bodyClassName = '',
  footerClassName = '',
  closeOnBackdropClick = false,
  allowMinimize = true,
  isMinimized: controlledMinimized,
  onToggleMinimize,
  ariaLabelledBy,
  role = 'dialog'
}) => {
  const panelRef = useRef<HTMLDivElement>(null);
  const [offset, setOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [internalMinimized, setInternalMinimized] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const isMinimized =
    controlledMinimized !== undefined ? controlledMinimized : internalMinimized;

  const dragSessionRef = useRef<{
    startClientX: number;
    startClientY: number;
    startOffsetX: number;
    startOffsetY: number;
    baseLeft: number;
    baseTop: number;
    width: number;
    height: number;
  } | null>(null);

  const clampOffsetToViewport = useCallback(
    (rawOffsetX: number, rawOffsetY: number, baseLeft: number, baseTop: number, width: number, height: number) => {
      if (typeof window === 'undefined') return { x: rawOffsetX, y: rawOffsetY };
      const pad = 8;
      const vw = window.innerWidth;
      const vh = window.innerHeight;

      const minLeft = pad;
      const maxLeft = Math.max(pad, vw - width - pad);
      const targetLeft = Math.min(maxLeft, Math.max(minLeft, baseLeft + rawOffsetX));

      const minTop = pad;
      const maxTop =
        height <= vh - pad * 2
          ? Math.max(pad, vh - height - pad)
          : Math.max(pad, vh - 76);
      const targetTop = Math.min(maxTop, Math.max(minTop, baseTop + rawOffsetY));

      return {
        x: Math.round(targetLeft - baseLeft),
        y: Math.round(targetTop - baseTop)
      };
    },
    []
  );

  // Reset drag position & minimize state when closed/re-opened
  useEffect(() => {
    if (!isOpen) {
      setOffset({ x: 0, y: 0 });
      setInternalMinimized(false);
      setIsDragging(false);
      dragSessionRef.current = null;
    }
  }, [isOpen]);

  // Escape key handler for modals
  useEffect(() => {
    if (!isOpen || !onClose || variant !== 'modal') return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, variant]);

  // Re-clamp on window resize or orientation change
  useEffect(() => {
    if (!isOpen) return;
    const handleResize = () => {
      const el = panelRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      setOffset(prev => {
        const baseLeft = rect.left - prev.x;
        const baseTop = rect.top - prev.y;
        return clampOffsetToViewport(prev.x, prev.y, baseLeft, baseTop, rect.width, rect.height);
      });
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [isOpen, clampOffsetToViewport]);

  const startDrag = (clientX: number, clientY: number) => {
    const el = panelRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    dragSessionRef.current = {
      startClientX: clientX,
      startClientY: clientY,
      startOffsetX: offset.x,
      startOffsetY: offset.y,
      baseLeft: rect.left - offset.x,
      baseTop: rect.top - offset.y,
      width: rect.width,
      height: rect.height
    };
    setIsDragging(true);
  };

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const session = dragSessionRef.current;
      if (!session) return;
      const dx = e.clientX - session.startClientX;
      const dy = e.clientY - session.startClientY;
      setOffset(
        clampOffsetToViewport(
          session.startOffsetX + dx,
          session.startOffsetY + dy,
          session.baseLeft,
          session.baseTop,
          session.width,
          session.height
        )
      );
    };

    const handleTouchMove = (e: TouchEvent) => {
      const session = dragSessionRef.current;
      const touch = e.touches[0];
      if (!session || !touch) return;
      if (e.cancelable) e.preventDefault();
      const dx = touch.clientX - session.startClientX;
      const dy = touch.clientY - session.startClientY;
      setOffset(
        clampOffsetToViewport(
          session.startOffsetX + dx,
          session.startOffsetY + dy,
          session.baseLeft,
          session.baseTop,
          session.width,
          session.height
        )
      );
    };

    const endDrag = () => {
      setIsDragging(false);
      dragSessionRef.current = null;
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', endDrag);
    window.addEventListener('touchmove', handleTouchMove, { passive: false });
    window.addEventListener('touchend', endDrag);
    window.addEventListener('touchcancel', endDrag);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', endDrag);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', endDrag);
      window.removeEventListener('touchcancel', endDrag);
    };
  }, [isDragging, clampOffsetToViewport]);

  if (!isOpen) return null;

  const isMoved = offset.x !== 0 || offset.y !== 0;
  const resolvedZIndex = zIndexClass || (variant === 'floating' ? 'z-40' : 'z-50');
  const isDark = theme === 'dark';

  const handleToggleMinimize = () => {
    if (onToggleMinimize) {
      onToggleMinimize();
    } else {
      setInternalMinimized(prev => !prev);
    }
  };

  const handleResetPosition = () => {
    setOffset({ x: 0, y: 0 });
  };

  const containerClasses =
    variant === 'floating'
      ? `fixed bottom-0 right-0 sm:bottom-4 sm:right-4 ${resolvedZIndex} flex justify-end pointer-events-none w-full sm:w-auto`
      : `fixed inset-0 ${resolvedZIndex} ${
          backdropClassName ||
          (isDark ? 'bg-slate-950/80 backdrop-blur-xs' : 'bg-slate-900/60 backdrop-blur-xs')
        } flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-150`;

  const basePanelTheme = isDark
    ? 'bg-slate-900 border-slate-700/90 text-slate-100'
    : 'bg-white border-slate-200 text-slate-800';

  const defaultHeaderTheme = isDark
    ? 'bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 border-slate-800 text-white'
    : 'bg-slate-50/90 border-slate-200/80 text-slate-900';

  const controlBtnTheme = isDark
    ? 'bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white'
    : 'bg-white hover:bg-slate-200/80 text-slate-500 hover:text-slate-900 border border-slate-200/80';

  return (
    <div
      className={containerClasses}
      role={variant === 'modal' ? role : undefined}
      aria-modal={variant === 'modal' ? true : undefined}
      aria-labelledby={ariaLabelledBy}
      onClick={
        variant === 'modal' && closeOnBackdropClick && onClose
          ? onClose
          : undefined
      }
    >
      <div
        ref={panelRef}
        onClick={(e) => e.stopPropagation()}
        style={{
          transform: `translate3d(${offset.x}px, ${offset.y}px, 0)`
        }}
        className={`pointer-events-auto border rounded-t-3xl sm:rounded-2xl shadow-2xl w-full ${maxWidthClass} flex flex-col overflow-hidden ${
          isDragging ? 'transition-none ring-2 ring-blue-500/50' : 'transition-shadow duration-150'
        } ${basePanelTheme} ${panelClassName}`}
      >
        {/* Mobile bottom-sheet pull bar indicator */}
        <div
          onMouseDown={(e) => {
            if (e.button !== 0) return;
            startDrag(e.clientX, e.clientY);
          }}
          onTouchStart={(e) => {
            const touch = e.touches[0];
            if (touch) startDrag(touch.clientX, touch.clientY);
          }}
          className={`pt-2 pb-0.5 flex justify-center sm:hidden cursor-move touch-none select-none ${
            headerClassName ? 'bg-transparent' : isDark ? 'bg-slate-900' : 'bg-slate-50/90'
          }`}
        >
          <div className={`w-12 h-1.5 rounded-full ${isDark ? 'bg-slate-700' : 'bg-slate-300'}`} />
        </div>

        {/* Draggable Top Header Bar */}
        <div
          onMouseDown={(e) => {
            if (e.button !== 0) return;
            startDrag(e.clientX, e.clientY);
          }}
          onTouchStart={(e) => {
            const touch = e.touches[0];
            if (touch) startDrag(touch.clientX, touch.clientY);
          }}
          className={`px-4 sm:px-5 py-3 border-b flex items-center justify-between gap-2 cursor-move select-none touch-none shrink-0 ${
            headerClassName || defaultHeaderTheme
          }`}
          title="Drag header to move window"
        >
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            <span
              className={`hidden sm:inline-flex items-center justify-center p-1 rounded-md shrink-0 ${
                isDark || headerClassName
                  ? 'text-slate-400 bg-white/10'
                  : 'text-slate-400 bg-slate-200/60'
              }`}
              aria-hidden="true"
            >
              <GripHorizontal className="w-4 h-4" />
            </span>
            {icon && <div className="shrink-0">{icon}</div>}
            <div className="min-w-0 flex-1">
              <div
                id={ariaLabelledBy}
                className="text-sm sm:text-base font-extrabold tracking-tight truncate"
              >
                {title}
              </div>
              {subtitle && (
                <div
                  className={`text-[11px] sm:text-xs truncate mt-0.5 ${
                    isDark || headerClassName ? 'opacity-80' : 'text-slate-500'
                  }`}
                >
                  {subtitle}
                </div>
              )}
            </div>
          </div>

          <div
            className="flex items-center gap-1 sm:gap-1.5 shrink-0 cursor-default"
            onMouseDown={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
          >
            {headerActions}

            {isMoved && (
              <button
                type="button"
                onClick={handleResetPosition}
                className={`compact-touch-ignore min-w-[36px] min-h-[36px] sm:min-w-0 sm:min-h-0 p-1.5 rounded-lg flex items-center justify-center transition-colors cursor-pointer ${controlBtnTheme}`}
                title="Reset window position to center"
                aria-label="Reset window position"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
            )}

            {allowMinimize && (
              <button
                type="button"
                onClick={handleToggleMinimize}
                className={`compact-touch-ignore min-w-[36px] min-h-[36px] sm:min-w-0 sm:min-h-0 p-1.5 rounded-lg flex items-center justify-center transition-colors cursor-pointer ${controlBtnTheme}`}
                title={isMinimized ? 'Expand window' : 'Minimize window to inspect underlying data'}
                aria-label={isMinimized ? 'Expand window' : 'Minimize window'}
              >
                {isMinimized ? (
                  <Maximize2 className="w-3.5 h-3.5" />
                ) : (
                  <Minus className="w-3.5 h-3.5" />
                )}
              </button>
            )}

            {onClose && (
              <button
                type="button"
                onClick={onClose}
                className={`min-w-[44px] min-h-[44px] sm:min-w-[34px] sm:min-h-[34px] p-1.5 rounded-lg flex items-center justify-center transition-colors cursor-pointer ${
                  isDark || headerClassName
                    ? 'bg-slate-800/80 hover:bg-rose-600 text-slate-300 hover:text-white'
                    : 'bg-white hover:bg-rose-50 text-slate-500 hover:text-rose-600 border border-slate-200/80'
                }`}
                title="Close window"
                aria-label="Close window"
              >
                <X className="w-4 h-4 sm:w-4 sm:h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Scrollable Window Body (Collapsed cleanly when minimized) */}
        {!isMinimized && (
          <div className={`max-h-[82vh] sm:max-h-[85vh] overflow-y-auto flex-1 ${bodyClassName}`}>
            {children}
          </div>
        )}

        {/* Optional Fixed Footer */}
        {!isMinimized && footer && (
          <div
            className={`px-4 sm:px-6 py-3.5 border-t shrink-0 ${
              isDark
                ? 'border-slate-800 bg-slate-950/90'
                : 'border-slate-100 bg-slate-50/80'
            } ${footerClassName}`}
          >
            {footer}
          </div>
        )}
      </div>
    </div>
  );
};

export default DraggableWindow;
