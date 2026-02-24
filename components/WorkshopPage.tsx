import React, { useState } from 'react';
import { Plus, X } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import { useJobs } from '../contexts/JobContext';
import { JobStatus, JobPriority, WorkOrder, JobType } from '../types';
import { CheckInModal } from './CheckInModal';
import { useResources } from '../contexts/ResourceContext';

export const WorkshopPage: React.FC = () => {
  const { t } = useLanguage();
  const { jobs, updateJob, addWorkLog, addWorkPart } = useJobs();
  const { getCustomerById } = useResources();

  const [isCheckInOpen, setIsCheckInOpen] = useState(false);
  const [selectedJob, setSelectedJob] = useState<WorkOrder | null>(null);

  const [activeTab, setActiveTab] = useState<'info' | 'time' | 'parts'>('info');
  const [newTime, setNewTime] = useState({ desc: '', minutes: '' });
  const [newPart, setNewPart] = useState({ name: '', qty: '1', cost: '' });

  const workshopJobs = jobs.filter((job) => job.job_type === JobType.WORKSHOP);

  const handleJobCreated = (_newJob: WorkOrder) => {};

  const handleStatusChange = (status: JobStatus) => {
    if (!selectedJob) return;

    updateJob(selectedJob.id, { status });
    setSelectedJob((prev) => (prev ? { ...prev, status } : null));
  };

  const addTimeEntry = async () => {
    if (!selectedJob || !newTime.minutes) return;

    const entry = {
      description: newTime.desc || 'Labor',
      minutes: Number.parseInt(newTime.minutes, 10),
    };

    await addWorkLog(selectedJob.id, entry);
    setSelectedJob((prev) =>
      prev
        ? {
            ...prev,
            time_log: [...(prev.time_log ?? []), entry],
          }
        : null,
    );
    setNewTime({ desc: '', minutes: '' });
  };

  const addPartEntry = async () => {
    if (!selectedJob || !newPart.name) return;

    const entry = {
      part_name: newPart.name,
      qty: Number.parseInt(newPart.qty, 10),
      cost: Number.parseFloat(newPart.cost || '0'),
    };

    await addWorkPart(selectedJob.id, entry);
    setSelectedJob((prev) =>
      prev
        ? {
            ...prev,
            parts_used: [...(prev.parts_used ?? []), entry],
          }
        : null,
    );
    setNewPart({ name: '', qty: '1', cost: '' });
  };

  const columns = [
    { id: 'received', title: t('status.WORKSHOP_RECEIVED'), status: JobStatus.WORKSHOP_RECEIVED },
    { id: 'troubleshooting', title: t('status.WORKSHOP_TROUBLESHOOTING'), status: JobStatus.WORKSHOP_TROUBLESHOOTING },
    { id: 'parts', title: t('status.WORKSHOP_WAITING_PARTS'), status: JobStatus.WORKSHOP_WAITING_PARTS },
    { id: 'ready', title: t('status.WORKSHOP_READY'), status: JobStatus.WORKSHOP_READY },
  ];

  return (
    <div className="flex-1 bg-slate-50 min-h-full font-sans flex flex-col h-screen relative">
      <div className="bg-white border-b border-gray-200 px-8 py-5 flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{t('workshop.title')}</h1>
          <p className="text-slate-500 text-sm mt-1">{t('workshop.subtitle')}</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsCheckInOpen(true)}
            className="flex items-center gap-2 bg-docuraft-navy text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-slate-800 transition shadow-sm"
          >
            <Plus className="w-4 h-4" />
            {t('workshop.check_in')}
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-x-auto overflow-y-hidden p-6 bg-slate-50">
        <div className="flex gap-6 h-full min-w-[1000px]">
          {columns.map((column) => (
            <div key={column.id} className="flex-1 flex flex-col bg-gray-100/50 rounded-xl border border-gray-200/60 max-w-sm min-w-[300px]">
              <div className="p-4 flex justify-between items-center border-b border-gray-200/60 bg-gray-50 rounded-t-xl">
                <h3 className="font-bold text-slate-700 text-sm uppercase tracking-wide">{column.title}</h3>
                <span className="bg-gray-200 text-gray-600 text-xs font-bold px-2 py-0.5 rounded-full">
                  {workshopJobs.filter((job) => job.status === column.status).length}
                </span>
              </div>
              <div className="flex-1 overflow-y-auto p-3 space-y-3 custom-scrollbar">
                {workshopJobs
                  .filter((job) => job.status === column.status)
                  .map((job) => {
                    const customer = getCustomerById(job.customer_id);
                    return (
                      <div
                        key={job.id}
                        onClick={() => setSelectedJob(job)}
                        className="bg-white p-4 rounded-lg shadow-sm border border-gray-200 hover:shadow-md hover:border-docuraft-navy/30 transition-all cursor-pointer group"
                      >
                        <div className="flex justify-between items-start mb-2">
                          <span className="text-xs text-gray-400 font-mono">#{job.id.slice(0, 8)}</span>
                          <div className={`w-2 h-2 rounded-full ${job.priority === JobPriority.CRITICAL ? 'bg-red-500' : 'bg-emerald-500'}`}></div>
                        </div>
                        <h4 className="font-bold text-slate-900 mb-1">{customer?.name || t('common.unknown')}</h4>
                        <p className="text-sm text-slate-600 line-clamp-2 mb-3 leading-relaxed">{job.description}</p>
                        <div className="flex items-center justify-between text-xs text-gray-400 mt-2">
                          <span>{new Date(job.created_at).toLocaleDateString()}</span>
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>
          ))}
        </div>
      </div>

      {selectedJob && (
        <div className="absolute inset-y-0 right-0 w-[450px] bg-white shadow-2xl border-l border-gray-200 z-20 flex flex-col transform transition-transform duration-300">
          <div className="p-6 border-b border-gray-100 flex justify-between items-start bg-gray-50">
            <div>
              <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                {selectedJob.id}
                <span className="text-sm font-medium px-2 py-0.5 bg-white border border-gray-200 rounded text-slate-500">{t('workshop.badge')}</span>
              </h2>
              <p className="text-slate-500 text-sm mt-1">{getCustomerById(selectedJob.customer_id)?.name || t('common.unknown')}</p>
            </div>
            <button onClick={() => setSelectedJob(null)} className="p-1 hover:bg-gray-200 rounded-full transition-colors">
              <X className="w-5 h-5 text-slate-500" />
            </button>
          </div>

          <div className="p-4 border-b border-gray-100">
            <label className="block text-xs font-bold text-slate-400 uppercase mb-2">{t('workshop.current_status')}</label>
            <select
              value={selectedJob.status}
              onChange={(event) => handleStatusChange(event.target.value as JobStatus)}
              className="w-full p-2 bg-white border border-gray-200 rounded-lg text-sm font-semibold text-slate-700 focus:ring-2 focus:ring-docuraft-navy/20 outline-none"
            >
              {columns.map((column) => (
                <option key={column.id} value={column.status}>
                  {column.title}
                </option>
              ))}
            </select>
          </div>

          <div className="flex border-b border-gray-200">
            <button
              onClick={() => setActiveTab('info')}
              className={`flex-1 py-3 text-sm font-semibold border-b-2 ${
                activeTab === 'info' ? 'border-docuraft-navy text-docuraft-navy' : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              {t('workshop.tab_info')}
            </button>
            <button
              onClick={() => setActiveTab('time')}
              className={`flex-1 py-3 text-sm font-semibold border-b-2 ${
                activeTab === 'time' ? 'border-docuraft-navy text-docuraft-navy' : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              {t('workshop.tab_time')}
            </button>
            <button
              onClick={() => setActiveTab('parts')}
              className={`flex-1 py-3 text-sm font-semibold border-b-2 ${
                activeTab === 'parts' ? 'border-docuraft-navy text-docuraft-navy' : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              {t('workshop.tab_parts')}
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-6 bg-white">
            {activeTab === 'info' && (
              <div className="space-y-4">
                <div className="bg-blue-50 p-4 rounded-xl border border-blue-100">
                  <h4 className="text-sm font-bold text-blue-800 mb-1">{t('workshop.issue')}</h4>
                  <p className="text-sm text-blue-700">{selectedJob.description}</p>
                </div>
              </div>
            )}

            {activeTab === 'time' && (
              <div className="space-y-6">
                <div className="space-y-3">
                  {selectedJob.time_log?.map((log, i) => (
                    <div key={i} className="flex justify-between items-center p-3 bg-gray-50 rounded-lg border border-gray-100">
                      <span className="text-sm font-medium text-slate-700">{log.description}</span>
                      <span className="text-xs font-bold bg-white px-2 py-1 rounded border border-gray-200">
                        {log.minutes} {t('workshop.minutes')}
                      </span>
                    </div>
                  ))}
                  {(!selectedJob.time_log || selectedJob.time_log.length === 0) && (
                    <div className="text-center text-slate-400 text-sm py-4 italic">{t('workshop.no_time')}</div>
                  )}
                </div>

                <div className="pt-4 border-t border-gray-100">
                  <h4 className="text-xs font-bold text-slate-400 uppercase mb-3">{t('workshop.log_time')}</h4>
                  <div className="space-y-3">
                    <input
                      type="text"
                      placeholder={t('workshop.placeholder_desc')}
                      value={newTime.desc}
                      onChange={(event) => setNewTime({ ...newTime, desc: event.target.value })}
                      className="w-full p-2 border border-gray-200 rounded-lg text-sm"
                    />
                    <div className="flex gap-2">
                      <input
                        type="number"
                        placeholder={t('workshop.placeholder_minutes')}
                        value={newTime.minutes}
                        onChange={(event) => setNewTime({ ...newTime, minutes: event.target.value })}
                        className="flex-1 p-2 border border-gray-200 rounded-lg text-sm"
                      />
                      <button onClick={addTimeEntry} className="px-4 bg-docuraft-navy text-white rounded-lg text-sm font-semibold hover:bg-slate-800">
                        {t('workshop.add_time')}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'parts' && (
              <div className="space-y-6">
                <div className="space-y-3">
                  {selectedJob.parts_used?.map((part, i) => (
                    <div key={i} className="flex justify-between items-center p-3 bg-gray-50 rounded-lg border border-gray-100">
                      <div>
                        <div className="text-sm font-medium text-slate-700">{part.part_name}</div>
                        <div className="text-xs text-slate-400">
                          {t('workshop.qty')}: {part.qty}
                        </div>
                      </div>
                      <span className="text-xs font-bold text-slate-700">${part.cost}</span>
                    </div>
                  ))}
                  {(!selectedJob.parts_used || selectedJob.parts_used.length === 0) && (
                    <div className="text-center text-slate-400 text-sm py-4 italic">{t('workshop.no_parts')}</div>
                  )}
                </div>

                <div className="pt-4 border-t border-gray-100">
                  <h4 className="text-xs font-bold text-slate-400 uppercase mb-3">{t('workshop.log_parts')}</h4>
                  <div className="space-y-3">
                    <input
                      type="text"
                      placeholder={t('workshop.placeholder_part')}
                      value={newPart.name}
                      onChange={(event) => setNewPart({ ...newPart, name: event.target.value })}
                      className="w-full p-2 border border-gray-200 rounded-lg text-sm"
                    />
                    <div className="flex gap-2">
                      <input
                        type="number"
                        placeholder={t('workshop.placeholder_qty')}
                        value={newPart.qty}
                        onChange={(event) => setNewPart({ ...newPart, qty: event.target.value })}
                        className="w-20 p-2 border border-gray-200 rounded-lg text-sm"
                      />
                      <input
                        type="number"
                        placeholder={t('workshop.placeholder_cost')}
                        value={newPart.cost}
                        onChange={(event) => setNewPart({ ...newPart, cost: event.target.value })}
                        className="flex-1 p-2 border border-gray-200 rounded-lg text-sm"
                      />
                    </div>
                    <button onClick={addPartEntry} className="w-full py-2 bg-docuraft-navy text-white rounded-lg text-sm font-semibold hover:bg-slate-800">
                      {t('workshop.add_part')}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {isCheckInOpen && <CheckInModal onClose={() => setIsCheckInOpen(false)} onJobCreated={handleJobCreated} />}
    </div>
  );
};
