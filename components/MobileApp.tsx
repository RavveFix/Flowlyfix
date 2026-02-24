import React, { useState } from 'react';
import { WorkOrderCard } from './WorkOrderCard';
import { JobStatus, JobType, JobPriority } from '../types';
import { Bell, Search, MapPin, Clock, ChevronRight, AlertCircle, PlayCircle, CheckCircle2 } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import { useJobs } from '../contexts/JobContext';
import { TranslationKey } from '../i18n/translations';
import { useResources } from '../contexts/ResourceContext';
import { useAuth } from '../contexts/AuthContext';

interface MobileAppProps {
  isSimulator: boolean;
}

export const MobileApp: React.FC<MobileAppProps> = ({ isSimulator }) => {
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const { t, language } = useLanguage();
  const { jobs, updateJob } = useJobs();
  const { getCustomerById, getAssetById } = useResources();
  const { profile } = useAuth();

  const fieldJobs = jobs.filter((job) => job.job_type !== JobType.WORKSHOP);

  const activeJob = activeJobId ? fieldJobs.find((job) => job.id === activeJobId) : null;
  const locale = language === 'sv' ? 'sv-SE' : 'en-US';

  const handleStatusUpdate = (status: JobStatus) => {
    if (activeJobId) {
      updateJob(activeJobId, { status });
    }
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

  const getMockTime = (index: number) => {
    const times = ['08:00', '10:30', '13:00', '15:30', '16:45'];
    return times[index % times.length];
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
              <button className="p-2 bg-white rounded-full shadow-sm border border-gray-100 active:scale-95 transition-transform">
                <Bell className="w-5 h-5 text-slate-800" />
              </button>
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
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-lg font-bold text-slate-900">
                {t('mobile.assigned_jobs')}{' '}
                <span className="text-slate-400 font-normal text-sm ml-1">({fieldJobs.filter((job) => job.status !== JobStatus.DONE).length})</span>
              </h2>
              <button className="text-docuraft-navy p-2 bg-slate-50 rounded-full">
                <Search className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4 pb-32">
              {fieldJobs.map((job, index) => {
                const customer = getCustomerById(job.customer_id);
                const priorityColor = getPriorityColor(job.priority);

                return (
                  <div
                    key={job.id}
                    onClick={() => setActiveJobId(job.id)}
                    className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm active:scale-[0.98] transition-all cursor-pointer relative overflow-hidden group hover:shadow-md hover:border-gray-200"
                  >
                    <div className={`absolute left-0 top-0 bottom-0 w-1.5 ${priorityColor}`}></div>

                    <div className="pl-3 flex justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1.5">
                          <div className="flex items-center gap-1.5 bg-slate-50 px-2 py-1 rounded text-[11px] font-bold text-slate-500">
                            <Clock className="w-3 h-3" />
                            {getMockTime(index)}
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

                        <h3 className="font-bold text-slate-900 text-[17px] leading-tight mb-1 truncate">{customer?.name || 'Unknown customer'}</h3>
                        <p className="text-slate-500 text-sm truncate mb-3">{job.description}</p>

                        <div className="flex items-center text-slate-400 text-xs gap-1.5">
                          <MapPin className="w-3.5 h-3.5 text-slate-300" />
                          <span className="truncate">{customer?.address || '-'}</span>
                        </div>
                      </div>

                      <div className="flex flex-col items-end justify-between py-1">
                        <div className="bg-gray-50 p-2 rounded-full border border-gray-100">{getStatusIcon(job.status)}</div>
                        <ChevronRight className="w-5 h-5 text-slate-300 group-hover:text-slate-500 transition-colors" />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
