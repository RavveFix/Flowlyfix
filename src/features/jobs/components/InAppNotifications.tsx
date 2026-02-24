import React from 'react';
import { Bell, X } from 'lucide-react';
import { useJobs } from '@/features/jobs/state/JobContext';
import { useLanguage } from '@/shared/i18n/LanguageContext';

interface NotificationBellButtonProps {
  onClick: () => void;
  buttonRef?: React.Ref<HTMLButtonElement>;
  className?: string;
  iconClassName?: string;
  title?: string;
  ariaExpanded?: boolean;
  ariaControls?: string;
}

interface InAppNotificationsProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  variant: 'desktop-dropdown' | 'mobile-sheet';
  anchor?: 'topbar' | 'mobile-header';
  showPreview?: boolean;
  panelId?: string;
  triggerRef?: React.RefObject<HTMLElement | null>;
  className?: string;
}

const getFocusableElements = (container: HTMLElement): HTMLElement[] => {
  const selectors = [
    'a[href]',
    'button:not([disabled])',
    'input:not([disabled])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
  ].join(',');

  return Array.from(container.querySelectorAll<HTMLElement>(selectors)).filter(
    (node) => !node.hasAttribute('disabled') && node.getAttribute('aria-hidden') !== 'true',
  );
};

const NotificationList: React.FC = () => {
  const { notifications, dismissNotification, clearNotifications } = useJobs();
  const { t } = useLanguage();

  return (
    <>
      <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
        <h3 className="font-semibold text-slate-800">{t('notif.title')}</h3>
        <button onClick={clearNotifications} className="text-xs text-slate-500 hover:text-slate-700">
          {t('notif.clear_all')}
        </button>
      </div>

      <div className="max-h-72 overflow-y-auto">
        {notifications.length === 0 ? (
          <div className="p-4 text-sm text-slate-500">{t('notif.none')}</div>
        ) : (
          notifications.map((notification) => (
            <div key={notification.id} className="p-3 border-b border-slate-100 last:border-b-0">
              {notification.title && <div className="font-medium text-slate-800 text-sm">{notification.title}</div>}
              <p className="text-sm text-slate-600">{notification.message}</p>
              <div className="mt-1 text-[11px] text-slate-400">{new Date(notification.created_at).toLocaleTimeString()}</div>
              <button
                className="mt-2 text-xs text-slate-500 hover:text-slate-700"
                onClick={() => dismissNotification(notification.id)}
              >
                {t('common.close')}
              </button>
            </div>
          ))
        )}
      </div>
    </>
  );
};

export const NotificationBellButton: React.FC<NotificationBellButtonProps> = ({
  onClick,
  buttonRef,
  className,
  iconClassName,
  title,
  ariaExpanded,
  ariaControls,
}) => {
  const { notifications } = useJobs();
  const { t } = useLanguage();
  const unreadCount = notifications.length;

  return (
    <button
      ref={buttonRef}
      onClick={onClick}
      className={className ? `relative ${className}` : 'relative'}
      title={title ?? t('notif.button_title')}
      aria-label={title ?? t('notif.button_title')}
      aria-haspopup="dialog"
      aria-expanded={ariaExpanded}
      aria-controls={ariaControls}
      type="button"
    >
      <Bell className={iconClassName ?? 'w-5 h-5'} />
      {unreadCount > 0 && (
        <span className="absolute -top-1 -right-1 min-w-[20px] h-5 px-1 rounded-full bg-rose-500 text-white text-[10px] leading-none font-bold tabular-nums flex items-center justify-center">
          {unreadCount > 9 ? '9+' : unreadCount}
        </span>
      )}
    </button>
  );
};

export const InAppNotifications: React.FC<InAppNotificationsProps> = ({
  open,
  onOpenChange,
  variant,
  anchor,
  showPreview = false,
  panelId,
  triggerRef,
  className,
}) => {
  const { t } = useLanguage();
  const panelRef = React.useRef<HTMLDivElement>(null);
  const previousOpen = React.useRef(open);
  const touchStartY = React.useRef<number | null>(null);

  React.useEffect(() => {
    if (!open || variant !== 'desktop-dropdown') {
      return;
    }

    const handlePointerDown = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node;
      const panel = panelRef.current;
      if (!panel) {
        return;
      }

      if (panel.contains(target)) {
        return;
      }

      if (triggerRef?.current?.contains(target)) {
        return;
      }

      onOpenChange(false);
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('touchstart', handlePointerDown);

    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('touchstart', handlePointerDown);
    };
  }, [open, onOpenChange, triggerRef, variant]);

  React.useEffect(() => {
    if (!open) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onOpenChange(false);
        return;
      }

      if (variant !== 'mobile-sheet' || event.key !== 'Tab') {
        return;
      }

      const container = panelRef.current;
      if (!container) {
        return;
      }

      const focusable = getFocusableElements(container);
      if (focusable.length === 0) {
        event.preventDefault();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement as HTMLElement | null;

      if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      } else if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, onOpenChange, variant]);

  React.useEffect(() => {
    if (open && panelRef.current) {
      const focusable = getFocusableElements(panelRef.current);
      if (focusable.length > 0) {
        focusable[0].focus();
      } else {
        panelRef.current.focus();
      }
    }
  }, [open]);

  React.useEffect(() => {
    if (previousOpen.current && !open) {
      triggerRef?.current?.focus();
    }
    previousOpen.current = open;
  }, [open, triggerRef]);

  if (!open) {
    return null;
  }

  if (variant === 'mobile-sheet') {
    return (
      <div className={className ?? 'fixed inset-0 z-[70]'} role="presentation">
        <button
          type="button"
          aria-label={t('common.close')}
          className="absolute inset-0 bg-slate-900/40 backdrop-blur-[1px]"
          onClick={() => onOpenChange(false)}
        />
        <div
          id={panelId}
          role="dialog"
          aria-modal="true"
          aria-label={t('notif.title')}
          ref={panelRef}
          tabIndex={-1}
          className="absolute inset-x-0 bottom-0 rounded-t-2xl border border-slate-200 bg-white shadow-2xl overflow-hidden max-h-[75vh]"
          data-anchor={anchor}
          onTouchStart={(event) => {
            touchStartY.current = event.touches[0]?.clientY ?? null;
          }}
          onTouchEnd={(event) => {
            if (touchStartY.current === null) {
              return;
            }

            const endY = event.changedTouches[0]?.clientY ?? touchStartY.current;
            const delta = endY - touchStartY.current;
            touchStartY.current = null;

            if (delta > 80) {
              onOpenChange(false);
            }
          }}
        >
          <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
            <h3 className="font-semibold text-slate-800">{t('notif.title')}</h3>
            <button
              onClick={() => onOpenChange(false)}
              className="text-slate-400 hover:text-slate-700"
              aria-label={t('common.close')}
              type="button"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <NotificationList />
        </div>
      </div>
    );
  }

  return (
    <div
      id={panelId}
      role="dialog"
      aria-modal="false"
      ref={panelRef}
      tabIndex={-1}
      className={className ?? 'absolute right-0 top-full mt-2 w-96 max-w-[90vw] rounded-xl border border-slate-200 bg-white shadow-xl overflow-hidden z-50'}
      data-anchor={anchor}
      data-preview={showPreview}
    >
      <NotificationList />
    </div>
  );
};
