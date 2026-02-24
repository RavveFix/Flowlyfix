import React from 'react';
import { CloudOff, RefreshCw } from 'lucide-react';
import { useJobs } from '../contexts/JobContext';

export const OfflineSyncBanner: React.FC = () => {
  const { isOffline, pendingMutations, syncPendingMutations } = useJobs();

  if (!isOffline && pendingMutations === 0) {
    return null;
  }

  return (
    <div className="fixed top-4 right-4 z-50 bg-amber-50 border border-amber-200 rounded-xl shadow-sm px-4 py-3 min-w-[260px]">
      <div className="flex items-start gap-3">
        <CloudOff className="w-4 h-4 text-amber-700 mt-0.5" />
        <div className="flex-1">
          <p className="text-sm font-semibold text-amber-900">Offline mode</p>
          <p className="text-xs text-amber-800">
            {pendingMutations} pending {pendingMutations === 1 ? 'change' : 'changes'} waiting to sync.
          </p>
          {!isOffline && pendingMutations > 0 && (
            <button
              onClick={() => syncPendingMutations()}
              className="mt-2 text-xs px-2 py-1 rounded bg-amber-100 border border-amber-300 text-amber-900 hover:bg-amber-200 inline-flex items-center gap-1"
            >
              <RefreshCw className="w-3 h-3" />
              Sync now
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
