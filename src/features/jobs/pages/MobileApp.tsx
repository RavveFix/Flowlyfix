import React, { useMemo, useState } from 'react';
import { WorkOrderCard } from '@/features/jobs/components/WorkOrderCard';
import { JobStatus, JobType, JobPriority, WorkOrder } from '@/shared/types';
import { Search, MapPin, Clock, ChevronRight, ChevronDown, AlertCircle, PlayCircle, CheckCircle2, Briefcase } from 'lucide-react';
import { useLanguage } from '@/shared/i18n/LanguageContext';
import { useJobs } from '@/features/jobs/state/JobContext';
import { TranslationKey } from '@/shared/i18n/translations';
import { useResources } from '@/features/resources/state/ResourceContext';
import { useAuth } from '@/features/auth/state/AuthContext';
import { InAppNotifications, NotificationBellButton } from '@/features/jobs/components/InAppNotifications';

interface MobileAppProps {
  isSimulator: boolean;
}

export const MobileApp: React.FC<MobileAppProps> = ({ isSimulator }) => {
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [isAvailableExpanded, setIsAvailableExpanded] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const { t, language } = useLanguage();
  const { jobs, updateJob, completeForBilling } = useJobs();
  const { getCustomerById, getAssetById } = useResources();
  const { profile } = useAuth();
  const notificationButtonRef = React.useRef<HTMLButtonElement>(null);

  const locale = language === 'sv' ? 'sv-SE' : 'en-US';

  const fieldJobs = useMemo(
    () => jobs.filter((job) => job.job_type !== JobType.WORKSHOP),
    [jobs],
  );

  const myJobs = useMemo(
    () =>
      fieldJobs
        .filter((job) => job.assigned_to_user_id === profile?.id && job.status !== JobStatus.DONE)
        .sort((a, b) => {
          if (a.scheduled_start && b.scheduled_start) return a.scheduled_start.localeCompare(b.scheduled_start);
          if (a.scheduled_start) return -1;
          if (b.scheduled_start) return 1;
          return 0;
        }),
    [fieldJobs, profile?.id],
  );

  const availableJobs = useMemo(
    () => fieldJobs.filter((job) => job.status === JobStatus.OPEN && !job.assigned_to_user_id),
    [fieldJobs],
  );

  const filteredMyJobs = useMemo(() => {
    if (!searchQuery) return myJobs;
    const q = searchQuery.toLowerCase();
    return myJobs.filter((job) => {
      const customer = getCustomerById(job.customer_id);
      return (
        (customer?.name?.toLowerCase().includes(q)) ||
        job.description.toLowerCase().includes(q)
      );
    });
  }, [myJobs, searchQuery, getCustomerById]);

  const activeJob = activeJobId ? fieldJobs.find((job) => job.id === activeJobId) : null;

  const handleStatusUpdate = async (status: JobStatus, payload: { report: string }) => {
    if (!activeJobId) return;

    if (status === JobStatus.DONE) {
      await completeForBilling(activeJobId, {
        report: payload.report,
        signedName: profile?.full_name || 'Technician',
      });
      return;
    }

    await updateJob(activeJobId, {
      status,
      technician_report: payload.report.trim() || null,
    });
  };

  const handleClaimJob = async (event: React.MouseEvent, jobId: string) => {
    event.stopPropagation();
    if (!profile?.id) return;
    await updateJob(jobId, {
      status: JobStatus.ASSIGNED,
      assigned_to_user_id: profile.id,
    });
  };

  const formatScheduledTime = (job: WorkOrder): string => {
    if (!job.scheduled_start) return t('mobile.not_scheduled');
    const start = new Date(job.scheduled_start);
    const timeStr = start.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
    if (job.scheduled_end) {
      const end = new Date(job.scheduled_end);
      const endStr = end.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
      return `${timeStr}–${endStr}`;
    }
    return timeStr;
  };

  const getPriorityColor = (priority: JobPriority) => {
    switch (priority) {
      case JobPriority.CRITICAL:
        return 'bg-red-500';
      case JobPriority.HIGH:
        return 'bg-orange-500';
      case JobPriority.NORMAL:
        return 'bg-blue-500';
      default:
        return 'bg-slate-300';
    }
  };

  const getStatusIcon = (status: JobStatus) => {
    switch (status) {
      case JobStatus.DONE:
        return <CheckCircle2 className="w-5 h-5 text-emerald-500" />;
      case JobStatus.IN_PROGRESS:
        return <PlayCircle className="w-5 h-5 text-blue-500" />;
      case JobStatus.TRAVELING:
        return <MapPin className="w-5 h-5 text-amber-500" />;
      default:
        return <Clock className="w-5 h-5 text-slate-400" />;
    }
  };

  const renderJobCard = (job: WorkOrder, options?: { showClaimButton?: boolean }) => {
    const customer = getCustomerById(job.customer_id);
    const priorityColor = getPriorityColor(job.priority);

    return (
      <div
        key={job.id}
        onClick={() => !options?.showClaimButton && setActiveJobId(job.id)}
        className={`bg-white border border-gray-100 rounded-2xl p-4 shadow-sm transition-all relative overflow-hidden group hover:shadow-md hover:border-gray-200 ${
          options?.showClaimButton ? '' : 'active:scale-[0.98] cursor-pointer'
        }`}
      >
        <div className={`absolute left-0 top-0 bottom-0 w-1.5 ${priorityColor}`}></div>

        <div className="pl-3 flex justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1.5">
              <div className="flex items-center gap-1.5 bg-slate-50 px-2 py-1 rounded text-[11px] font-bold text-slate-500">
                <Clock className="w-3 h-3" />
                {formatScheduledTime(job)}
              </div>
              {(job.priority === JobPriority.CRITICAL || job.priority === JobPriority.HIGH) && (
                <div
                  className={`flex items-center gap-1 px-2 py-1 rounded text-[10px] font-bold ${
                    job.priority === JobPriority.CRITICAL ? 'bg-red-50 text-red-600' : 'bg-orange-50 text-orange-600'
                  }`}
                >
                  <AlertCircle className="w-3 h-3" />
                  {t(`priority.${job.priority}` as TranslationKey)}
                </div>
              )}
            </div>

            <h3 className="font-bold text-slate-900 text-[17px] leading-tight mb-1 truncate">{customer?.name || t('common.unknown')}</h3>
            <p className="text-slate-500 text-sm truncate mb-3">{job.description}</p>

            <div className="flex items-center text-slate-400 text-xs gap-1.5">
              <MapPin className="w-3.5 h-3.5 text-slate-300" />
              <span className="truncate">{customer?.address || '-'}</span>
            </div>
          </div>

          <div className="flex flex-col items-end justify-between py-1">
            {options?.showClaimButton ? (
              <button
                onClick={(event) => handleClaimJob(event, job.id)}
                className="bg-docuraft-navy text-white text-xs font-bold px-3 py-2 rounded-xl hover:bg-slate-800 active:scale-95 transition-all shadow-sm"
              >
                {t('mobile.claim_job')}
              </button>
            ) : (
              <>
                <div className="bg-gray-50 p-2 rounded-full border border-gray-100">{getStatusIcon(job.status)}</div>
                <ChevronRight className="w-5 h-5 text-slate-300 group-hover:text-slate-500 transition-colors" />
              </>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="bg-gray-50 h-[100dvh] w-full relative font-sans overflow-hidden flex flex-col">
      {isSimulator && (
        <div className="absolute top-0 left-0 right-0 h-12 flex justify-center items-end z-30 pointer-events-none">
          <div className="bg-black rounded-full w-28 h-7 mb-2"></div>
        </div>
      )}

      {activeJob ? (
        <div className={`h-full ${isSimulator ? 'pt-10' : 'pt-0'}`}>
          <WorkOrderCard
            job={activeJob}
            customer={getCustomerById(activeJob.customer_id)}
            asset={getAssetById(activeJob.asset_id)}
            onClose={() => setActiveJobId(null)}
            onStatusUpdate={handleStatusUpdate}
          />
        </div>
      ) : (
        <div className={`flex-1 flex flex-col ${isSimulator ? 'pt-12' : 'pt-6'} overflow-hidden`}>
          <div className="px-6 pb-4 shrink-0">
            <div className="flex justify-between items-center mb-6">
              <div className="w-10 h-10 bg-slate-200 rounded-full flex items-center justify-center text-slate-600 font-bold border-2 border-white shadow-sm">
                {(profile?.full_name || 'JD')
                  .split(' ')
                  .map((name) => name.charAt(0))
                  .join('')
                  .slice(0, 2)
                  .toUpperCase()}
              </div>
              <NotificationBellButton
                onClick={() => setIsNotificationsOpen((prev) => !prev)}
                buttonRef={notificationButtonRef}
                className="p-2 bg-white rounded-full shadow-sm border border-gray-100 active:scale-95 transition-transform relative"
                iconClassName="w-5 h-5 text-slate-800"
                ariaExpanded={isNotificationsOpen}
                ariaControls="field-mobile-notifications-panel"
              />
            </div>
            <h1 className="text-3xl font-bold text-slate-900 tracking-tight">{t('mobile.my_day')}</h1>
            <p className="text-slate-500 font-medium capitalize flex items-center gap-2">
              {new Date().toLocaleDateString(locale, { weekday: 'long', month: 'long', day: 'numeric' })}
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
            </p>
          </div>

          <div className="flex gap-3 overflow-x-auto px-6 pb-6 no-scrollbar snap-x shrink-0">
            {[...Array(5)].map((_, i) => {
              const date = new Date();
              date.setDate(date.getDate() + i);
              const isToday = i === 0;
              return (
                <div
                  key={i}
                  className={`flex flex-col items-center min-w-[60px] p-3 rounded-2xl border transition-all snap-start ${
                    isToday ? 'bg-slate-900 text-white border-slate-900 shadow-lg scale-105' : 'bg-white text-slate-400 border-gray-100'
                  }`}
                >
                  <span className="text-xs font-medium uppercase">{date.toLocaleDateString(locale, { weekday: 'short' }).replace('.', '')}</span>
                  <span className="text-xl font-bold mt-1">{date.getDate()}</span>
                </div>
              );
            })}
          </div>

          <div className="flex-1 bg-white rounded-t-[32px] shadow-[0_-10px_40px_-15px_rgba(0,0,0,0.1)] overflow-y-auto px-6 py-8">
            {/* My Jobs header */}
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-lg font-bold text-slate-900">
                {t('mobile.assigned_jobs')}{' '}
                <span className="text-slate-400 font-normal text-sm ml-1">({filteredMyJobs.length})</span>
              </h2>
              <button
                onClick={() => setIsSearchOpen((prev) => !prev)}
                className={`p-2 rounded-full transition-colors ${isSearchOpen ? 'bg-docuraft-navy text-white' : 'text-docuraft-navy bg-slate-50'}`}
              >
                <Search className="w-4 h-4" />
              </button>
            </div>

            {isSearchOpen && (
              <div className="mb-4">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder={t('dispatch.filter_placeholder')}
                  autoFocus
                  className="w-full px-4 py-2.5 bg-slate-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-docuraft-navy/20 focus:border-docuraft-navy/30"
                />
              </div>
            )}

            {/* My Jobs list */}
            <div className="space-y-4">
              {filteredMyJobs.length === 0 && (
                <div className="text-center py-12">
                  <div className="w-16 h-16 mx-auto mb-4 bg-slate-100 rounded-full flex items-center justify-center">
                    <Briefcase className="w-7 h-7 text-slate-400" />
                  </div>
                  <p className="text-slate-400 text-sm font-medium">{t('mobile.no_jobs_today')}</p>
                </div>
              )}
              {filteredMyJobs.map((job) => renderJobCard(job))}
            </div>

            {/* Available Jobs section */}
            {availableJobs.length > 0 && (
              <div className="mt-8">
                <button
                  onClick={() => setIsAvailableExpanded((prev) => !prev)}
                  className="flex items-center justify-between w-full mb-4"
                >
                  <h2 className="text-lg font-bold text-slate-900">
                    {t('mobile.available_jobs')}{' '}
                    <span className="text-slate-400 font-normal text-sm ml-1">({availableJobs.length})</span>
                  </h2>
                  <ChevronDown
                    className={`w-5 h-5 text-slate-400 transition-transform ${isAvailableExpanded ? 'rotate-180' : ''}`}
                  />
                </button>

                {isAvailableExpanded && (
                  <div className="space-y-4">
                    {availableJobs.map((job) => renderJobCard(job, { showClaimButton: true }))}
                  </div>
                )}
              </div>
            )}

            <div className="pb-32" />
          </div>
        </div>
      )}
      <InAppNotifications
        open={isNotificationsOpen}
        onOpenChange={setIsNotificationsOpen}
        variant="mobile-sheet"
        anchor="mobile-header"
        panelId="field-mobile-notifications-panel"
        triggerRef={notificationButtonRef}
      />
    </div>
  );
};
