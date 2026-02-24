import React, { useState, useRef, useEffect } from 'react';
import { MapPin, User, Clock, CheckCircle2, Navigation, FileText, Mic, X, History, Calendar, Box } from 'lucide-react';
import { WorkOrder, JobStatus, Customer, Asset } from '../types';
import { useLanguage } from '../contexts/LanguageContext';
import { TranslationKey } from '../i18n/translations';

interface WorkOrderCardProps {
  job: WorkOrder;
  customer?: Customer;
  asset?: Asset;
  onClose: () => void;
  onStatusUpdate: (status: JobStatus) => void;
}

// Mock function to generate history for the demo
const getAssetHistory = (assetId: string) => {
  // Static data simulating "Last 3 logs"
  return [
    { id: 101, date: '2023-11-12', technician: 'Sarah C.', description: 'Replaced main fuse and tested voltage stability. System operating within normal parameters.' },
    { id: 102, date: '2023-09-05', technician: 'Kyle R.', description: 'Monthly scheduled maintenance. Cleaned filters and checked oil levels.' },
    { id: 103, date: '2023-07-20', technician: 'T-800', description: 'Hydraulic fluid top-up following minor leak report.' },
  ];
};

/**
 * WorkOrderCard Component
 * Displays detailed information about a job and allows status updates.
 * Includes a simulated AI Voice Input feature for the work log.
 */
export const WorkOrderCard: React.FC<WorkOrderCardProps> = ({ job, customer, asset, onClose, onStatusUpdate }) => {
  const [selectedStatus, setSelectedStatus] = useState<JobStatus>(job.status);
  const [workLog, setWorkLog] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const { t } = useLanguage();
  
  // Ref for managing the recording timeout to allow cancellation
  const recordingTimeoutRef = useRef<number | null>(null);

  const history = getAssetHistory(asset?.id || '');

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (recordingTimeoutRef.current) {
        clearTimeout(recordingTimeoutRef.current);
      }
    };
  }, []);

  // Helper to determine status border visuals
  const getStatusBorderClass = (status: JobStatus) => {
    return selectedStatus === status 
      ? 'border-docuraft-navy border-2 bg-slate-50 ring-1 ring-docuraft-navy/20' 
      : 'border-gray-200 border bg-white';
  };

  const handleMicClick = () => {
    if (isRecording) {
      // Stop recording manually
      setIsRecording(false);
      if (recordingTimeoutRef.current) {
        clearTimeout(recordingTimeoutRef.current);
        recordingTimeoutRef.current = null;
      }
    } else {
      // Start recording simulation
      setIsRecording(true);
      
      // Simulate voice input delay
      recordingTimeoutRef.current = window.setTimeout(() => {
        setWorkLog(prev => {
           const spacer = prev.length > 0 ? " " : "";
           const simulatedText = "Checked the voltage levels and found a variance in the main circuit. Replaced the fuse and calibrated the sensors.";
           return prev + spacer + simulatedText;
        });
        setIsRecording(false);
        recordingTimeoutRef.current = null;
      }, 2000);
    }
  };

  return (
    <div className="flex flex-col h-full bg-white md:max-w-md md:mx-auto md:rounded-t-3xl md:shadow-2xl relative overflow-hidden font-sans">
      
      {/* Header (Sticky Top) */}
      <div className="sticky top-0 bg-white z-10 px-6 pt-6 pb-2 border-b border-gray-100">
        <div className="flex justify-between items-center mb-1">
          <button onClick={onClose} className="p-2 -ml-2 rounded-full hover:bg-gray-100 transition-colors">
            <X className="w-6 h-6 text-slate-800" />
          </button>
        </div>
        <h1 className="text-3xl font-bold text-slate-900 tracking-tight">
          WO #{job.id.slice(0,4)}
        </h1>
      </div>

      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto no-scrollbar pb-24">
        
        {/* Description & Asset Details */}
        <div className="px-6 py-6 border-b border-gray-100">
           <div className="mb-5">
               <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">{t('ticket.description')}</h2>
               <p className="text-slate-900 text-lg font-medium leading-relaxed">{job.description}</p>
           </div>
           
           <div className="bg-slate-50 rounded-2xl p-4 border border-gray-200 flex items-start gap-4">
               <div className="bg-white p-3 rounded-xl border border-gray-200 shadow-sm text-docuraft-navy shrink-0">
                   <Box className="w-6 h-6" />
               </div>
               <div>
                   <div className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">{t('wo.asset_label').replace(':','')}</div>
                   <div className="font-bold text-slate-900 text-base leading-tight">{asset?.model || 'Unknown asset'}</div>
                   <div className="font-mono text-xs text-slate-500 mt-1.5 bg-gray-200/50 px-1.5 py-0.5 rounded inline-block">SN: {asset?.serial_number || '-'}</div>
               </div>
           </div>
        </div>
        
        {/* Location Section */}
        <div className="px-6 py-6 border-b border-gray-100 active:bg-gray-50 transition-colors cursor-pointer group">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="bg-gray-100 p-2.5 rounded-full">
                <MapPin className="w-6 h-6 text-slate-900" />
              </div>
              <div>
                <p className="font-semibold text-slate-900 text-[17px]">{customer?.address || t('common.no_address')}</p>
                <p className="text-slate-500 text-sm">{customer?.name || t('common.unknown')}</p>
              </div>
            </div>
            <div className="text-gray-400 group-hover:text-gray-600">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
            </div>
          </div>
        </div>

        {/* Contact Section */}
        <div className="px-6 py-6 border-b border-gray-100 active:bg-gray-50 transition-colors cursor-pointer group">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="bg-gray-100 p-2.5 rounded-full">
                <User className="w-6 h-6 text-slate-900" />
              </div>
              <div>
                <p className="font-semibold text-slate-900 text-[17px]">{customer?.contact_person || t('wo.site_manager_default')}</p>
                <p className="text-emerald-600 text-sm font-medium">{t('wo.asset_label')} {asset?.model || t('common.unknown')}</p>
              </div>
            </div>
            <div className="text-gray-400 group-hover:text-gray-600">
               <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
            </div>
          </div>
        </div>

        {/* Status Selection (The "Priority/Standard" equivalent) */}
        <div className="px-6 py-6">
          <div className="flex justify-between items-end mb-4">
            <h2 className="text-[17px] font-bold text-slate-900">{t('wo.job_status')}</h2>
            <span className="text-slate-500 text-sm bg-gray-100 px-2 py-1 rounded-md">
              {t(`priority.${job.priority}` as TranslationKey)}
            </span>
          </div>

          <div className="flex flex-col gap-3">
            {/* Status Option 1: Traveling */}
            <button 
              onClick={() => setSelectedStatus(JobStatus.TRAVELING)}
              className={`w-full text-left p-4 rounded-xl transition-all duration-200 ${getStatusBorderClass(JobStatus.TRAVELING)}`}
            >
              <div className="flex justify-between items-center">
                <span className="font-semibold text-slate-900 text-lg">{t('wo.start_travel')}</span>
                <span className="text-slate-900 font-medium text-sm">{t('time.plus_30')}</span>
              </div>
              <p className="text-slate-500 text-sm mt-1">{t('wo.navigate')}</p>
            </button>

            {/* Status Option 2: In Progress */}
            <button 
              onClick={() => setSelectedStatus(JobStatus.IN_PROGRESS)}
              className={`w-full text-left p-4 rounded-xl transition-all duration-200 ${getStatusBorderClass(JobStatus.IN_PROGRESS)}`}
            >
              <div className="flex justify-between items-center">
                <span className="font-semibold text-slate-900 text-lg">{t('wo.start_job')}</span>
              </div>
              <p className="text-slate-500 text-sm mt-1">{t('wo.log_time')}</p>
            </button>

            {/* Status Option 3: Done */}
            <button 
              onClick={() => setSelectedStatus(JobStatus.DONE)}
              className={`w-full text-left p-4 rounded-xl transition-all duration-200 ${getStatusBorderClass(JobStatus.DONE)}`}
            >
               <div className="flex justify-between items-center">
                <span className="font-semibold text-slate-900 text-lg">{t('wo.complete')}</span>
              </div>
              <p className="text-slate-500 text-sm mt-1">{t('wo.generate_report')}</p>
            </button>
          </div>
        </div>

        {/* Work Log Section & History */}
        <div className="px-6 pb-6">
          <div className="flex justify-between items-center mb-3">
             <h2 className="text-[17px] font-bold text-slate-900">{t('wo.tech_report')}</h2>
             <button 
                onClick={() => setShowHistory(!showHistory)}
                className="flex items-center gap-1.5 text-emerald-600 text-sm font-semibold hover:text-emerald-700 bg-emerald-50 px-3 py-1.5 rounded-full transition-colors"
             >
                <History className="w-4 h-4" />
                {showHistory ? t('wo.hide_history') : t('wo.see_history')}
             </button>
          </div>

          {/* History Accordion */}
          <div className={`overflow-hidden transition-all duration-300 ease-in-out ${showHistory ? 'max-h-96 opacity-100 mb-4' : 'max-h-0 opacity-0'}`}>
            <div className="bg-gray-50 rounded-xl border border-gray-200 p-3 space-y-3">
                <div className="text-xs font-bold text-slate-400 uppercase tracking-wider px-1">{t('wo.asset_history_title')}</div>
                {history.map((log) => (
                    <div key={log.id} className="bg-white p-3 rounded-lg border border-gray-100 shadow-sm">
                        <div className="flex justify-between items-center mb-1">
                            <div className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
                                <Calendar className="w-3 h-3" />
                                {log.date}
                            </div>
                            <span className="text-xs font-bold text-slate-800">{log.technician}</span>
                        </div>
                        <p className="text-sm text-slate-600 leading-snug">{log.description}</p>
                    </div>
                ))}
            </div>
          </div>
          
          <div className="flex items-center gap-3 mb-2">
             <span className="text-gray-400 font-medium">1</span>
             <span className="text-slate-800 font-medium">{job.description}</span>
             <span className="ml-auto text-slate-900 font-semibold">$0.00</span>
          </div>
          
          {/* AI Voice Input Area */}
          <div className="relative mt-4">
             <textarea 
               value={workLog}
               onChange={(e) => setWorkLog(e.target.value)}
               placeholder={t('wo.describe_work')}
               className="w-full bg-gray-50 border border-gray-200 rounded-xl p-4 pr-12 text-slate-800 focus:outline-none focus:ring-2 focus:ring-docuraft-navy/20 min-h-[100px]"
             />
             <button 
                onClick={handleMicClick}
                className={`absolute bottom-3 right-3 p-3 rounded-full transition-all duration-200 shadow-sm flex items-center justify-center ${
                  isRecording 
                    ? 'bg-red-500 text-white animate-pulse scale-110 ring-4 ring-red-100' 
                    : 'bg-gray-100 text-slate-500 hover:bg-gray-200 hover:text-slate-700'
                }`}
                title={isRecording ? "Stop Recording" : "Start Voice Input"}
             >
               <Mic className={`w-5 h-5 ${isRecording ? 'animate-bounce' : ''}`} />
             </button>
             {isRecording && (
                <span className="absolute bottom-3 right-16 text-xs font-bold text-red-500 animate-pulse bg-white/90 backdrop-blur px-3 py-1.5 rounded-full shadow-sm border border-red-100">
                    {t('wo.listening')}
                </span>
             )}
          </div>
        </div>
      </div>

      {/* Footer / Sticky Button */}
      <div className="absolute bottom-0 left-0 w-full bg-white border-t border-gray-100 p-4 pb-6">
        <button 
          onClick={() => onStatusUpdate(selectedStatus)}
          className="w-full bg-slate-900 text-white font-bold text-lg py-4 rounded-xl shadow-lg hover:bg-slate-800 active:scale-[0.98] transition-all flex justify-center items-center gap-2"
        >
          {selectedStatus === JobStatus.DONE ? t('wo.complete_sign') : t('wo.update_status')}
          <span className="opacity-60 font-normal ml-1">· {t('wo.syncs_fortnox')}</span>
        </button>
        <div className="w-32 h-1 bg-gray-300 rounded-full mx-auto mt-4"></div>
      </div>
    </div>
  );
};
