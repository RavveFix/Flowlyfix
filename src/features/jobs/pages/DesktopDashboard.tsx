import React, { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BillingStatus, JobStatus, JobPriority, WorkOrder } from '@/shared/types';
import { Search, Plus, ArrowRight, Activity, Map, Calendar, CheckCircle2, Clock } from 'lucide-react';
import { useLanguage } from '@/shared/i18n/LanguageContext';
import { useJobs } from '@/features/jobs/state/JobContext';
import { CreateTicketModal } from '@/features/jobs/components/CreateTicketModal';
import { InAppNotifications, NotificationBellButton } from '@/features/jobs/components/InAppNotifications';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { useResources } from '@/features/resources/state/ResourceContext';

export const DesktopDashboard: React.FC = () => {
  const { t } = useLanguage();
  const { jobs } = useJobs();
  const { getCustomerById, technicians } = useResources();
  const navigate = useNavigate();
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const notificationButtonRef = useRef<HTMLButtonElement>(null);
  
  // Workflow Counts
  const unscheduledCount = jobs.filter(j => j.status === JobStatus.OPEN).length;
  const activeCount = jobs.filter(j => [JobStatus.ASSIGNED, JobStatus.TRAVELING, JobStatus.IN_PROGRESS].includes(j.status)).length;
  const readyCount = jobs.filter(j => j.billing_status === BillingStatus.READY).length;

  const handleJobCreated = (_newJob: WorkOrder) => {};

  const activeJobs = jobs.filter(j => j.status !== JobStatus.DONE && j.status !== JobStatus.WEB_PENDING).slice(0, 5);

  return (
    <div className="min-h-full font-sans pb-12">
      
      {/* Top Navigation Bar - Clean & White */}
      <div className="bg-white border-b border-docuraft-border px-4 md:px-8 py-4 sticky top-0 z-20 flex justify-between items-center shadow-sm">
        <h1 className="text-xl md:text-2xl font-bold text-slate-900 tracking-tight">{t('dash.title')}</h1>
        <div className="flex items-center gap-2 md:gap-4">
            <div className="relative hidden lg:block group">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-docuraft-navy transition-colors z-10" />
                <Input 
                  type="text" 
                  placeholder={t('dash.search_placeholder')}
                  className="pl-10 pr-4 bg-slate-50 border-transparent rounded-full text-sm focus-visible:bg-white focus-visible:border-docuraft-border focus-visible:ring-1 focus-visible:ring-docuraft-navy/20 w-64 transition-all h-10"
                />
            </div>
            <div className="relative hidden sm:block">
              <NotificationBellButton
                onClick={() => setIsNotificationsOpen((prev) => !prev)}
                buttonRef={notificationButtonRef}
                className="rounded-full relative flex items-center justify-center w-10 h-10 text-slate-500 hover:text-slate-700 hover:bg-slate-50"
                ariaExpanded={isNotificationsOpen}
                ariaControls="desktop-notifications-panel"
                iconClassName="w-5 h-5"
              />
              <InAppNotifications
                open={isNotificationsOpen}
                onOpenChange={setIsNotificationsOpen}
                variant="desktop-dropdown"
                anchor="topbar"
                panelId="desktop-notifications-panel"
                triggerRef={notificationButtonRef}
              />
            </div>
            <div className="hidden sm:block h-8 w-px bg-gray-200 mx-1"></div>
            <Button 
                onClick={() => setIsCreateModalOpen(true)}
                className="flex items-center justify-center gap-2 bg-docuraft-navy text-white px-4 md:px-5 rounded-full text-sm font-semibold hover:bg-slate-800 hover:shadow-lg hover:shadow-slate-900/10 active:scale-95 transition-all h-10"
            >
                <Plus className="w-4 h-4" />
                <span className="hidden sm:inline">{t('dash.create_ticket')}</span>
                <span className="sm:hidden">Skapa</span>
            </Button>
        </div>
      </div>

      <div className="p-4 md:p-8 max-w-[1600px] mx-auto space-y-6 md:space-y-8">
        
        {/* Workflow Ribbon - "Jobber Style" Overview */}
        <section>
            <div className="flex justify-between items-end mb-4">
                <h2 className="text-lg font-bold text-slate-800">{t('dash.wip.title')}</h2>
                <span className="text-xs md:text-sm text-slate-500 font-medium">{t('dash.last_30_days')}</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* 2. Unscheduled */}
                <WorkflowCard 
                    label={t('dispatch.col.unassigned')} 
                    count={unscheduledCount} 
                    color="orange" 
                    icon={<Calendar className="w-5 h-5" />}
                    subtext={t('dash.kpi.needs_scheduling')}
                />

                {/* 3. Active Jobs */}
                <WorkflowCard 
                    label={t('dash.kpi.active_jobs')}
                    count={activeCount} 
                    color="emerald" 
                    icon={<Activity className="w-5 h-5" />}
                    subtext={t('dash.kpi.in_progress_now')}
                />

                {/* 4. Ready to Invoice */}
                <WorkflowCard 
                    label={t('history.ready_to_invoice')} 
                    count={readyCount}
                    color="purple" 
                    icon={<CheckCircle2 className="w-5 h-5" />}
                    subtext={t('dash.kpi.review_and_send')}
                    onClick={() => navigate('/admin/billing?tab=ready')}
                />
            </div>
        </section>

        {/* Main Content Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            
            {/* Left Column: Schedule / Today's Jobs */}
            <div className="lg:col-span-2 space-y-6">
                <div className="bg-white rounded-2xl shadow-card border border-docuraft-border overflow-hidden">
                    <div className="px-6 py-5 border-b border-gray-100 flex justify-between items-center">
                        <h3 className="font-bold text-slate-800 text-lg">{t('mobile.assigned_jobs')}</h3>
                    </div>
                    
                    <div className="divide-y divide-gray-50">
                        {activeJobs.length === 0 ? (
                            <div className="p-8 text-center text-slate-400 italic">{t('dash.no_scheduled_jobs_today')}</div>
                        ) : (
                            activeJobs.map((job) => (
                                <div key={job.id} className="p-5 hover:bg-slate-50 transition-colors group cursor-pointer flex items-center justify-between">
                                    <div className="flex items-start gap-4">
                                        {/* Status Indicator Line */}
                                        <div className={`w-1 self-stretch rounded-full ${
                                            job.priority === JobPriority.CRITICAL ? 'bg-red-500' : 
                                            job.priority === JobPriority.HIGH ? 'bg-orange-500' : 'bg-emerald-500'
                                        }`}></div>
                                        
                                        <div>
                                            <div className="flex items-center gap-2 mb-1">
                                                <h4 className="font-bold text-slate-900">{getCustomerById(job.customer_id)?.name || t('common.unknown')}</h4>
                                                <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded font-mono">#{job.id.split('-')[1]}</span>
                                            </div>
                                            <p className="text-sm text-slate-500 mb-2 line-clamp-1">{job.description}</p>
                                            <div className="flex items-center gap-4 text-xs font-medium text-slate-400">
                                                <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> 09:00 - 11:00</span>
                                                <span className="flex items-center gap-1"><Map className="w-3 h-3" /> {getCustomerById(job.customer_id)?.address || '-'}</span>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-4">
                                         <div className="text-right hidden sm:block">
                                            {job.assigned_to_user_id ? (
                                                 <div className="flex -space-x-2">
                                                    <div className="w-8 h-8 rounded-full bg-slate-200 border-2 border-white flex items-center justify-center text-xs font-bold text-slate-600" title={job.assigned_to_user_id}>
                                                        {job.assigned_to_user_id.charAt(0)}
                                                    </div>
                                                 </div>
                                            ) : (
                                                <span className="text-xs text-orange-500 bg-orange-50 px-2 py-1 rounded font-bold">{t('table.unassigned')}</span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </div>

            {/* Right Column: Activity & Map */}
            <div className="space-y-6">
                
                {/* Mini Map Widget */}
                <div className="bg-white rounded-2xl shadow-card border border-docuraft-border overflow-hidden flex flex-col h-[280px]">
                    <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
                        <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2">
                            <Map className="w-4 h-4 text-slate-500" /> {t('dash.live_map')}
                        </h3>
                        <span className="relative flex h-2.5 w-2.5">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
                        </span>
                    </div>
                    <div className="flex-1 bg-slate-100 relative group cursor-pointer overflow-hidden">
                        <div className="absolute inset-0 opacity-40" style={{ backgroundImage: 'radial-gradient(#94a3b8 1px, transparent 1px)', backgroundSize: '20px 20px' }}></div>
                        {/* Mock Pins */}
                        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 transform">
                             <div className="bg-docuraft-navy text-white text-[10px] font-bold px-2 py-1 rounded shadow-lg mb-1 whitespace-nowrap">{t('table.technician')} A</div>
                             <div className="w-4 h-4 bg-docuraft-navy rounded-full border-2 border-white shadow mx-auto"></div>
                        </div>
                    </div>
                </div>

                {/* Technician Status List */}
                <div className="bg-white rounded-2xl shadow-card border border-docuraft-border overflow-hidden">
                    <div className="p-4 border-b border-gray-100">
                        <h3 className="font-bold text-slate-800 text-sm">{t('dash.technicians')}</h3>
                    </div>
                    <div className="divide-y divide-gray-50">
                        {technicians.slice(0,3).map(tech => (
                            <div key={tech.id} className="p-3 flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-xs font-bold text-slate-600">
                                        {tech.full_name.charAt(0)}
                                    </div>
                                    <div>
                                        <div className="text-sm font-bold text-slate-700">{tech.full_name}</div>
                                        <div className="text-[10px] text-emerald-600 font-medium flex items-center gap-1">
                                            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500"></div> {t('dispatch.tech_available')}
                                        </div>
                                    </div>
                                </div>
                                <Button variant="outline" size="sm" className="h-7 text-xs px-3">{t('dash.map')}</Button>
                            </div>
                        ))}
                    </div>
                </div>

            </div>
        </div>
      </div>

      {isCreateModalOpen && (
        <CreateTicketModal 
            onClose={() => setIsCreateModalOpen(false)} 
            onJobCreated={handleJobCreated} 
        />
      )}
    </div>
  );
};

// --- Workflow Card Component ---
const WorkflowCard = ({ label, count, color, icon, subtext, onClick }: any) => {
    // Map color props to tailwind classes
    const colors: any = {
        blue: 'bg-blue-50 text-blue-600 border-blue-100',
        orange: 'bg-orange-50 text-orange-600 border-orange-100',
        emerald: 'bg-emerald-50 text-emerald-600 border-emerald-100',
        purple: 'bg-purple-50 text-purple-600 border-purple-100'
    };
    
    const countColors: any = {
         blue: 'text-blue-700',
         orange: 'text-orange-700',
         emerald: 'text-emerald-700',
         purple: 'text-purple-700'
    }

    return (
        <button
            type="button"
            onClick={onClick}
            className="bg-white p-5 rounded-2xl shadow-card border border-docuraft-border hover:shadow-md transition-all cursor-pointer group relative overflow-hidden text-left w-full"
        >
            <div className={`absolute top-0 right-0 w-24 h-24 -mr-6 -mt-6 rounded-full opacity-10 ${colors[color].split(' ')[0]}`}></div>
            
            <div className="flex justify-between items-start mb-3 relative z-10">
                <div className={`p-2 rounded-lg ${colors[color]}`}>
                    {icon}
                </div>
                <ArrowRight className="w-4 h-4 text-gray-300 group-hover:text-gray-500 transition-colors" />
            </div>
            
            <div className={`text-3xl font-bold mb-1 ${countColors[color]}`}>{count}</div>
            <div className="font-bold text-slate-700">{label}</div>
            <div className="text-xs text-slate-400 mt-1">{subtext}</div>
        </button>
    );
}
