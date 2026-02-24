import React, { useMemo, useState } from 'react';
import { Search, Plus, Calendar, User as UserIcon, Clock, MapPin, PanelRight, ChevronDown } from 'lucide-react';
import { useLanguage } from '@/shared/i18n/LanguageContext';
import { useJobs } from '@/features/jobs/state/JobContext';
import { JobStatus, JobPriority, WorkOrder, JobType } from '@/shared/types';
import { TranslationKey } from '@/shared/i18n/translations';
import { CreateTicketModal } from '@/features/jobs/components/CreateTicketModal';
import { useResources } from '@/features/resources/state/ResourceContext';

interface TechnicianState {
  id: string;
  name: string;
  avatar: string;
  status: 'available' | 'busy';
}

interface JobCardProps {
  job: WorkOrder;
  customerName: string;
  technicians: TechnicianState[];
  onAssignClick: () => void;
}

export const DispatchPage: React.FC = () => {
  const { t } = useLanguage();
  const { jobs, updateJob } = useJobs();
  const { technicians: resourceTechnicians, getCustomerById } = useResources();

  const [assigningJobId, setAssigningJobId] = useState<string | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isTechSidebarOpen, setIsTechSidebarOpen] = useState(true);
  const [filterQuery, setFilterQuery] = useState('');
  const [techAvailability, setTechAvailability] = useState<Record<string, 'available' | 'busy'>>({});

  const fieldJobs = jobs.filter((job) => job.job_type !== JobType.WORKSHOP);

  const technicians = useMemo<TechnicianState[]>(
    () =>
      resourceTechnicians.map((tech) => ({
        id: tech.id,
        name: tech.full_name,
        avatar: tech.full_name
          .split(' ')
          .map((name) => name.charAt(0))
          .join('')
          .slice(0, 2)
          .toUpperCase(),
        status: techAvailability[tech.id] ?? 'available',
      })),
    [resourceTechnicians, techAvailability],
  );

  const toggleTechnicianStatus = (id: string) => {
    setTechAvailability((prev) => ({
      ...prev,
      [id]: (prev[id] ?? 'available') === 'available' ? 'busy' : 'available',
    }));
  };

  const handleAssign = (technicianId: string) => {
    if (!assigningJobId) return;

    updateJob(assigningJobId, {
      status: JobStatus.ASSIGNED,
      assigned_to_user_id: technicianId,
    });

    setAssigningJobId(null);
  };

  const handleJobCreated = (_newJob: WorkOrder) => {};

  const columns = [
    { id: 'unassigned', title: t('dispatch.col.unassigned'), statusFilter: (status: JobStatus) => status === JobStatus.OPEN, borderColor: 'border-orange-400' },
    { id: 'scheduled', title: t('dispatch.col.scheduled'), statusFilter: (status: JobStatus) => status === JobStatus.ASSIGNED, borderColor: 'border-blue-400' },
    {
      id: 'active',
      title: t('dispatch.col.active'),
      statusFilter: (status: JobStatus) => status === JobStatus.TRAVELING || status === JobStatus.IN_PROGRESS,
      borderColor: 'border-emerald-400',
    },
    { id: 'completed', title: t('dispatch.col.completed'), statusFilter: (status: JobStatus) => status === JobStatus.DONE, borderColor: 'border-purple-400' },
  ];

  return (
    <div className="flex-1 bg-docuraft-bg min-h-full font-sans flex flex-col h-screen overflow-hidden">
      <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between shrink-0 shadow-sm z-10">
        <div className="flex items-center gap-4">
          <h1 className="text-xl font-bold text-slate-900">{t('dispatch.title')}</h1>
          <div className="h-6 w-px bg-gray-200"></div>
          <div className="relative group">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-docuraft-navy" />
            <input
              type="text"
              placeholder={t('dispatch.filter_placeholder')}
              value={filterQuery}
              onChange={(event) => setFilterQuery(event.target.value)}
              className="pl-9 pr-4 py-1.5 bg-slate-50 border border-transparent rounded-md text-sm focus:bg-white focus:border-docuraft-border focus:ring-2 focus:ring-docuraft-navy/10 transition-all w-64"
            />
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button className="flex items-center gap-2 text-slate-600 bg-white border border-gray-200 hover:bg-gray-50 px-3 py-2 rounded-lg text-sm font-medium transition-colors">
            <Calendar className="w-4 h-4" />
            <span className="hidden sm:inline">{t('common.today')}</span>
            <ChevronDown className="w-3 h-3 text-slate-400" />
          </button>

          <button
            onClick={() => setIsTechSidebarOpen((prev) => !prev)}
            className={`flex items-center gap-2 border px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              isTechSidebarOpen
                ? 'bg-slate-100 border-slate-300 text-slate-900'
                : 'bg-white border-gray-200 text-slate-600 hover:bg-gray-50'
            }`}
          >
            <PanelRight className="w-4 h-4" />
            <span className="hidden sm:inline">{t('dispatch.technicians')}</span>
          </button>

          <button
            onClick={() => setIsCreateModalOpen(true)}
            className="flex items-center gap-2 bg-docuraft-navy text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-slate-800 transition shadow-sm"
          >
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">{t('dash.create_ticket')}</span>
          </button>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        <div className="flex-1 overflow-x-auto overflow-y-hidden p-6 bg-slate-100/50">
          <div className="flex gap-6 h-full min-w-[1200px]">
            {columns.map((column) => {
              const columnJobs = fieldJobs.filter((job) => {
                if (!column.statusFilter(job.status)) return false;

                const customerName = getCustomerById(job.customer_id)?.name?.toLowerCase() ?? '';
                const q = filterQuery.toLowerCase();
                return filterQuery === '' || customerName.includes(q) || job.description.toLowerCase().includes(q);
              });

              return (
                <div key={column.id} className="flex-1 flex flex-col min-w-[300px] h-full">
                  <div className={`flex justify-between items-center mb-4 pb-2 border-b-2 ${column.borderColor}`}>
                    <h3 className="font-bold text-slate-700 text-sm uppercase tracking-wide">{column.title}</h3>
                    <span className="bg-white border border-gray-200 text-slate-600 text-xs font-bold px-2 py-0.5 rounded-full shadow-sm">
                      {columnJobs.length}
                    </span>
                  </div>

                  <div className="flex-1 overflow-y-auto pr-2 space-y-3 custom-scrollbar pb-20">
                    {columnJobs.map((job) => (
                      <JobCard
                        key={job.id}
                        job={job}
                        customerName={getCustomerById(job.customer_id)?.name || t('common.unknown')}
                        technicians={technicians}
                        onAssignClick={() => setAssigningJobId(job.id)}
                      />
                    ))}
                    {columnJobs.length === 0 && (
                      <div className="text-center py-10 border-2 border-dashed border-gray-200 rounded-xl">
                        <p className="text-slate-400 text-sm font-medium">{t('dispatch.no_jobs')}</p>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className={`bg-white border-l border-gray-200 transition-all duration-300 flex flex-col ${isTechSidebarOpen ? 'w-80' : 'w-0 overflow-hidden'}`}>
          <div className="p-5 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
            <h3 className="font-bold text-slate-800 text-sm">{t('dispatch.technicians')}</h3>
            <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-100">
              {technicians.filter((tech) => tech.status === 'available').length} {t('dispatch.tech_available')}
            </span>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {technicians.map((tech) => (
              <div key={tech.id} className="group">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-3">
                    <div className="relative">
                      <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-sm font-bold text-slate-600 border border-gray-200">
                        {tech.avatar}
                      </div>
                      <div
                        className={`absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-white ${
                          tech.status === 'available' ? 'bg-emerald-500' : 'bg-amber-500'
                        }`}
                      ></div>
                    </div>
                    <div>
                      <div className="font-bold text-slate-900 text-sm">{tech.name}</div>
                      <div className="text-xs text-slate-500 flex items-center gap-1">
                        <MapPin className="w-3 h-3" /> {t('dispatch.area_default')}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="pl-[52px] flex gap-2">
                  {assigningJobId ? (
                    <button
                      onClick={() => handleAssign(tech.id)}
                      className="flex-1 bg-docuraft-navy text-white text-xs font-bold py-1.5 rounded hover:bg-slate-800 transition-colors shadow-sm"
                    >
                      {t('dispatch.assign_job')}
                    </button>
                  ) : (
                    <button
                      onClick={() => toggleTechnicianStatus(tech.id)}
                      className={`flex-1 text-xs font-medium py-1.5 rounded border transition-colors ${
                        tech.status === 'available'
                          ? 'border-gray-200 text-slate-600 hover:bg-gray-50'
                          : 'border-emerald-200 text-emerald-700 bg-emerald-50 hover:bg-emerald-100'
                      }`}
                    >
                      {tech.status === 'available' ? t('dispatch.set_busy') : t('dispatch.set_available')}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {isCreateModalOpen && <CreateTicketModal onClose={() => setIsCreateModalOpen(false)} onJobCreated={handleJobCreated} />}

      {assigningJobId && <div className="absolute inset-0 bg-black/5 z-0 pointer-events-none"></div>}
    </div>
  );
};

const JobCard: React.FC<JobCardProps> = ({ job, customerName, technicians, onAssignClick }) => {
  const { t } = useLanguage();
  const tech = technicians.find((technician) => technician.id === job.assigned_to_user_id);

  let priorityClass = 'bg-slate-100 text-slate-600';
  if (job.priority === JobPriority.CRITICAL) priorityClass = 'bg-red-50 text-red-700 border border-red-100';
  if (job.priority === JobPriority.HIGH) priorityClass = 'bg-orange-50 text-orange-700 border border-orange-100';
  if (job.priority === JobPriority.NORMAL) priorityClass = 'bg-blue-50 text-blue-700 border border-blue-100';

  return (
    <div className="bg-white p-4 rounded-xl shadow-[0_2px_8px_rgba(0,0,0,0.04)] border border-gray-100 hover:shadow-md hover:border-gray-300 transition-all cursor-grab active:cursor-grabbing group relative">
      <div className="flex justify-between items-start mb-2">
        <div className="flex items-center gap-2">
          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wide ${priorityClass}`}>
            {t(`priority.${job.priority}` as TranslationKey)}
          </span>
          <span className="text-xs font-mono text-slate-400">#{job.id.slice(0, 8)}</span>
        </div>
        {job.status === JobStatus.OPEN && (
          <button onClick={onAssignClick} className="text-xs bg-slate-900 text-white px-2 py-1 rounded hover:bg-slate-700 transition-colors shadow-sm">
            {t('dispatch.assign_btn')}
          </button>
        )}
      </div>

      <h4 className="font-bold text-slate-900 leading-tight mb-1">{customerName}</h4>
      <p className="text-xs text-slate-500 line-clamp-2 mb-3 leading-relaxed">{job.description}</p>

      <div className="flex items-center justify-between pt-2 border-t border-gray-50 mt-2">
        <div className="flex items-center gap-2 text-xs text-slate-400 font-medium">
          <Clock className="w-3 h-3" />
          <span>2h</span>
        </div>

        {tech ? (
          <div className="flex items-center gap-1.5 bg-gray-50 pl-1 pr-2 py-0.5 rounded-full border border-gray-100">
            <div className="w-4 h-4 rounded-full bg-slate-200 flex items-center justify-center text-[8px] font-bold text-slate-600">{tech.avatar}</div>
            <span className="text-[10px] font-bold text-slate-600 truncate max-w-[60px]">{tech.name}</span>
          </div>
        ) : (
          <div className="flex items-center gap-1 text-xs text-slate-300">
            <UserIcon className="w-3 h-3" />
            <span>{t('table.unassigned')}</span>
          </div>
        )}
      </div>
    </div>
  );
};
