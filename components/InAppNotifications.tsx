import React, { useMemo, useState } from 'react';
import { Bell, CircleAlert, CircleCheck, CircleX, Info, X } from 'lucide-react';
import { useJobs } from '../contexts/JobContext';

export const InAppNotifications: React.FC = () => {
  const { notifications, dismissNotification, clearNotifications } = useJobs();
  const [open, setOpen] = useState(false);

  const unreadCount = notifications.length;

  const topNotification = notifications[0];

  const icon = useMemo(() => {
    if (!topNotification) return <Info className="w-4 h-4" />;

    switch (topNotification.type) {
      case 'success':
        return <CircleCheck className="w-4 h-4" />;
      case 'warning':
        return <CircleAlert className="w-4 h-4" />;
      case 'error':
        return <CircleX className="w-4 h-4" />;
      default:
        return <Info className="w-4 h-4" />;
    }
  }, [topNotification]);

  return (
    <div className="fixed bottom-6 left-6 z-50">
      {topNotification && (
        <div className="mb-3 max-w-sm rounded-xl border border-slate-200 bg-white shadow-lg p-3 text-sm flex items-start gap-2">
          <div className="text-slate-500 mt-0.5">{icon}</div>
          <div className="flex-1 min-w-0">
            {topNotification.title && <div className="font-semibold text-slate-800">{topNotification.title}</div>}
            <p className="text-slate-600">{topNotification.message}</p>
          </div>
          <button className="text-slate-400 hover:text-slate-700" onClick={() => dismissNotification(topNotification.id)}>
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      <div className="relative">
        <button
          onClick={() => setOpen((prev) => !prev)}
          className="w-12 h-12 rounded-full bg-white border border-slate-200 shadow-lg flex items-center justify-center text-slate-700 hover:bg-slate-50"
          title="Notifications"
        >
          <Bell className="w-5 h-5" />
        </button>

        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[20px] h-5 px-1 rounded-full bg-rose-500 text-white text-[11px] font-bold flex items-center justify-center">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </div>

      {open && (
        <div className="absolute bottom-14 left-0 w-96 max-w-[90vw] rounded-xl border border-slate-200 bg-white shadow-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
            <h3 className="font-semibold text-slate-800">Notifications</h3>
            <button onClick={clearNotifications} className="text-xs text-slate-500 hover:text-slate-700">
              Clear all
            </button>
          </div>

          <div className="max-h-72 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="p-4 text-sm text-slate-500">No notifications.</div>
            ) : (
              notifications.map((notification) => (
                <div key={notification.id} className="p-3 border-b border-slate-100 last:border-b-0">
                  {notification.title && <div className="font-medium text-slate-800 text-sm">{notification.title}</div>}
                  <p className="text-sm text-slate-600">{notification.message}</p>
                  <div className="mt-1 text-[11px] text-slate-400">{new Date(notification.created_at).toLocaleTimeString()}</div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};
