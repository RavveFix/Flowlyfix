import React, { useState } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { useJobs } from '../contexts/JobContext';
import { JobStatus, WorkOrder } from '../types';
import { CheckCircle2, FileText, Send, Clock, Edit2, Save, X, Plus, Trash2 } from 'lucide-react';
import { useResources } from '../contexts/ResourceContext';

export const HistoryTab: React.FC = () => {
  const { t, language } = useLanguage();
  const { jobs, updateJob } = useJobs();
  const { getCustomerById } = useResources();
  const [editingJobId, setEditingJobId] = useState<string | null>(null);
  
  // State for editing both time and parts
  const [editData, setEditData] = useState<{ 
      id: string; 
      time_log: { description: string; minutes: number }[]; 
      parts_used: { part_name: string; qty: number; cost: number }[];
  }>({ id: '', time_log: [], parts_used: [] });

  const [invoicedJobs, setInvoicedJobs] = useState<string[]>([]);

  // Filter only DONE jobs
  const completedJobs = jobs.filter(j => j.status === JobStatus.DONE);

  const startEdit = (job: WorkOrder) => {
      setEditingJobId(job.id);
      
      // Ensure we have at least a default log entry if empty to allow editing
      const logs = (job.time_log && job.time_log.length > 0) 
        ? [...job.time_log] 
        : [{ description: 'Arbetstid', minutes: 0 }];

      // Ensure we have at least one part row if empty, so user can add one
      const parts = (job.parts_used && job.parts_used.length > 0)
        ? [...job.parts_used]
        : [{ part_name: '', qty: 1, cost: 0 }];

      setEditData({ 
          id: job.id, 
          time_log: logs,
          parts_used: parts
      });
  };

  const saveEdit = () => {
      // Filter out empty entries before saving
      const cleanedTime = editData.time_log.filter(t => t.description.trim() !== '' || t.minutes > 0);
      const cleanedParts = editData.parts_used.filter(p => p.part_name.trim() !== '');

      updateJob(editData.id, { 
          time_log: cleanedTime,
          parts_used: cleanedParts
      });
      setEditingJobId(null);
  };

  const cancelEdit = () => {
      setEditingJobId(null);
  };

  const updateTimeEntry = (index: number, field: 'description' | 'minutes', value: string | number) => {
      const newLogs = [...editData.time_log];
      newLogs[index] = { ...newLogs[index], [field]: value };
      setEditData({ ...editData, time_log: newLogs });
  };

  const updatePartEntry = (index: number, field: 'part_name' | 'qty' | 'cost', value: string | number) => {
      const newParts = [...editData.parts_used];
      newParts[index] = { ...newParts[index], [field]: value };
      setEditData({ ...editData, parts_used: newParts });
  };

  const removeTimeRow = (index: number) => {
      const newLogs = editData.time_log.filter((_, i) => i !== index);
      setEditData({ ...editData, time_log: newLogs });
  }

  const removePartRow = (index: number) => {
      const newParts = editData.parts_used.filter((_, i) => i !== index);
      setEditData({ ...editData, parts_used: newParts });
  }

  const addTimeRow = () => {
      setEditData({
          ...editData,
          time_log: [...editData.time_log, { description: '', minutes: 0 }]
      });
  };

  const addPartRow = () => {
      setEditData({
          ...editData,
          parts_used: [...editData.parts_used, { part_name: '', qty: 1, cost: 0 }]
      });
  };

  const handleSendInvoice = (jobId: string) => {
      setInvoicedJobs(prev => [...prev, jobId]);
      // Logic to actually trigger invoice generation would go here
  };

  if (completedJobs.length === 0) {
      return (
          <div className="p-12 text-center flex flex-col items-center justify-center text-slate-500">
              <div className="bg-slate-100 p-4 rounded-full mb-4">
                  <FileText className="w-8 h-8 text-slate-400" />
              </div>
              <p>{t('history.no_jobs')}</p>
          </div>
      );
  }

  return (
    <div className="space-y-6">
        <div className="bg-blue-50 border border-blue-100 p-4 rounded-lg flex items-start gap-3">
             <div className="bg-white p-2 rounded-full shadow-sm text-blue-500 mt-0.5">
                 <CheckCircle2 className="w-5 h-5" />
             </div>
             <div>
                 <h3 className="font-bold text-blue-900">{t('history.ready_to_invoice')}</h3>
                 <p className="text-sm text-blue-700 mt-1">{t('history.review_desc')}</p>
             </div>
        </div>

        <div className="space-y-4">
            {completedJobs.map(job => {
                const customer = getCustomerById(job.customer_id);
                const isEditing = editingJobId === job.id;
                const isInvoiced = invoicedJobs.includes(job.id);

                // Calculate total hours
                const currentLog = isEditing ? editData.time_log : job.time_log;
                const totalMinutes = currentLog?.reduce((acc, curr) => acc + (parseInt(curr.minutes as any) || 0), 0) || 0;
                const hours = Math.floor(totalMinutes / 60);
                const mins = totalMinutes % 60;

                return (
                    <div key={job.id} className={`bg-white border rounded-xl shadow-sm transition-all overflow-hidden ${isInvoiced ? 'border-emerald-200 bg-emerald-50/30' : 'border-gray-200'} ${isEditing ? 'ring-2 ring-emerald-500/20 border-emerald-500/50' : ''}`}>
                        {/* Header Row */}
                        <div className="p-6 flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-gray-100 bg-gray-50/50">
                            <div>
                                <div className="flex items-center gap-3 mb-1">
                                    <span className="font-mono text-xs font-bold bg-slate-200 text-slate-600 px-2 py-0.5 rounded">{job.id}</span>
                                    <span className="text-xs text-slate-400">{new Date(job.created_at).toLocaleDateString()}</span>
                                </div>
                                <h3 className="font-bold text-slate-900 text-lg">{customer?.name || t('common.unknown')}</h3>
                                <p className="text-sm text-slate-500">{job.description}</p>
                            </div>

                            <div className="flex items-center gap-3">
                                {!isEditing && !isInvoiced && (
                                    <button 
                                        onClick={() => startEdit(job)}
                                        className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 text-slate-700 font-medium rounded-lg hover:bg-gray-50 transition-colors text-sm"
                                    >
                                        <Edit2 className="w-4 h-4" />
                                        {t('common.edit')}
                                    </button>
                                )}
                                
                                {isInvoiced ? (
                                     <div className="flex items-center gap-2 px-4 py-2 bg-emerald-100 text-emerald-800 font-bold rounded-lg text-sm">
                                         <CheckCircle2 className="w-4 h-4" />
                                         {t('history.invoice_sent')}
                                     </div>
                                ) : (
                                    !isEditing && (
                                        <button 
                                            onClick={() => handleSendInvoice(job.id)}
                                            className="flex items-center gap-2 px-5 py-2 bg-docuraft-navy text-white font-medium rounded-lg hover:bg-slate-800 transition-colors shadow-sm disabled:opacity-50"
                                        >
                                            <Send className="w-4 h-4" />
                                            {t('history.send_invoice')}
                                        </button>
                                    )
                                )}
                            </div>
                        </div>

                        {/* Content Area */}
                        <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-8 items-start">
                            
                            {/* Time Logs */}
                            <div>
                                <div className="flex justify-between items-center mb-3">
                                    <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                                        <Clock className="w-3 h-3" /> {t('history.total_hours')}
                                    </h4>
                                    {isEditing && (
                                        <button onClick={addTimeRow} className="text-xs text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1">
                                            <Plus className="w-3 h-3" /> {t('history.add_row')}
                                        </button>
                                    )}
                                </div>

                                <div>
                                    {isEditing ? (
                                        <div>
                                            {/* Column Headers for Symmetry */}
                                            <div className="flex gap-3 px-1 mb-2">
                                                <label className="flex-1 text-[10px] uppercase font-bold text-slate-400 pl-1">{t('ticket.description')}</label>
                                                <label className="w-24 text-[10px] uppercase font-bold text-slate-400 text-right pr-8">{language === 'sv' ? 'Tid' : 'Time'}</label>
                                                <div className="w-5"></div>
                                            </div>

                                            <div className="space-y-2">
                                                {editData.time_log.map((log, idx) => (
                                                    <div key={idx} className="flex gap-3 items-center animate-in fade-in slide-in-from-top-1">
                                                        <div className="flex-1">
                                                            <input 
                                                                type="text" 
                                                                placeholder="Beskrivning"
                                                                value={log.description}
                                                                onChange={(e) => updateTimeEntry(idx, 'description', e.target.value)}
                                                                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-700 font-medium focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all placeholder:text-slate-400"
                                                            />
                                                        </div>
                                                        <div className="w-24 relative group">
                                                            <input 
                                                                type="number" 
                                                                value={log.minutes}
                                                                onChange={(e) => updateTimeEntry(idx, 'minutes', parseInt(e.target.value) || 0)}
                                                                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-700 font-medium focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all pr-8 text-right"
                                                            />
                                                            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 pointer-events-none">m</span>
                                                        </div>
                                                        <button onClick={() => removeTimeRow(idx)} className="text-slate-300 hover:text-red-500 transition-colors p-1.5 rounded-full hover:bg-red-50 flex items-center justify-center w-8 h-8">
                                                            <Trash2 className="w-4 h-4" />
                                                        </button>
                                                    </div>
                                                ))}
                                            </div>
                                            
                                            <div className="flex gap-3 mt-6 pt-4 border-t border-gray-100">
                                                <button onClick={saveEdit} className="flex-1 text-sm bg-emerald-600 text-white px-4 py-2.5 rounded-lg flex items-center justify-center gap-2 hover:bg-emerald-700 font-medium shadow-sm transition-colors">
                                                    <Save className="w-4 h-4" /> {t('common.save')}
                                                </button>
                                                <button onClick={cancelEdit} className="flex-1 text-sm bg-white border border-gray-200 text-slate-600 px-4 py-2.5 rounded-lg flex items-center justify-center gap-2 hover:bg-gray-50 font-medium transition-colors">
                                                    <X className="w-4 h-4" /> {t('common.cancel')}
                                                </button>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="bg-gray-50 rounded-xl p-4 border border-gray-100">
                                            {(!job.time_log || job.time_log.length === 0) ? (
                                                <p className="text-sm text-slate-400 italic">{t('history.no_time_logged')}</p>
                                            ) : (
                                                <ul className="space-y-2.5">
                                                    {job.time_log.map((log, i) => (
                                                        <li key={i} className="flex justify-between text-sm group">
                                                            <span className="text-slate-700 font-medium">{log.description}</span>
                                                            <span className="font-mono font-bold text-slate-900 bg-white px-2 py-0.5 rounded border border-gray-200 shadow-sm text-xs">{log.minutes} m</span>
                                                        </li>
                                                    ))}
                                                    <li className="pt-3 mt-3 border-t border-gray-200/60 flex justify-between items-center">
                                                        <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">{t('history.total')}</span>
                                                        <span className="font-bold text-slate-900 text-base">{hours}h {mins > 0 ? `${mins}m` : ''}</span>
                                                    </li>
                                                </ul>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Materials */}
                            <div>
                                <div className="flex justify-between items-center mb-3">
                                    <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                                        <FileText className="w-3 h-3" /> {t('history.materials')}
                                    </h4>
                                    {isEditing && (
                                        <button 
                                            onClick={addPartRow}
                                            className="text-xs text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1"
                                        >
                                            <Plus className="w-3 h-3" /> {t('history.add_row')}
                                        </button>
                                    )}
                                </div>
                                
                                <div className={isEditing ? '' : "bg-gray-50 rounded-xl p-4 border border-gray-100"}>
                                     {isEditing ? (
                                         <div>
                                            {/* Column Headers for Symmetry */}
                                            <div className="flex gap-3 px-1 mb-2">
                                                <label className="w-20 text-[10px] uppercase font-bold text-slate-400 text-center">{t('history.ph.qty')}</label>
                                                <label className="flex-1 text-[10px] uppercase font-bold text-slate-400 pl-1">{t('history.ph.part_name')}</label>
                                                <label className="w-24 text-[10px] uppercase font-bold text-slate-400 pl-1">{t('history.ph.cost')}</label>
                                                <div className="w-5"></div>
                                            </div>

                                            <div className="space-y-2">
                                                {editData.parts_used.map((part, idx) => (
                                                    <div key={idx} className="flex gap-3 items-center animate-in fade-in slide-in-from-top-1">
                                                        <div className="w-20">
                                                            <input 
                                                                type="number"
                                                                placeholder="0"
                                                                value={part.qty}
                                                                onChange={(e) => updatePartEntry(idx, 'qty', parseInt(e.target.value) || 0)}
                                                                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-700 font-medium focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none text-center transition-all"
                                                            />
                                                        </div>
                                                        <div className="flex-1">
                                                            <input 
                                                                type="text" 
                                                                placeholder="Artikelnamn"
                                                                value={part.part_name}
                                                                onChange={(e) => updatePartEntry(idx, 'part_name', e.target.value)}
                                                                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-700 font-medium focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all placeholder:text-slate-400"
                                                            />
                                                        </div>
                                                        <div className="w-24 relative">
                                                            <div className="relative">
                                                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm font-medium">$</span>
                                                                <input 
                                                                    type="number"
                                                                    placeholder="0"
                                                                    value={part.cost}
                                                                    onChange={(e) => updatePartEntry(idx, 'cost', parseFloat(e.target.value) || 0)}
                                                                    className="w-full px-3 py-2 pl-6 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-700 font-medium focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all"
                                                                />
                                                            </div>
                                                        </div>
                                                        <button onClick={() => removePartRow(idx)} className="text-slate-300 hover:text-red-500 transition-colors p-1.5 rounded-full hover:bg-red-50 flex items-center justify-center w-8 h-8">
                                                            <Trash2 className="w-4 h-4" />
                                                        </button>
                                                    </div>
                                                ))}
                                            </div>
                                         </div>
                                     ) : (
                                         <>
                                            {(!job.parts_used || job.parts_used.length === 0) ? (
                                                <p className="text-sm text-slate-400 italic">{t('history.no_materials_used')}</p>
                                            ) : (
                                                <ul className="space-y-2.5">
                                                    {job.parts_used.map((part, i) => (
                                                        <li key={i} className="flex justify-between text-sm items-center">
                                                            <span className="text-slate-700 font-medium flex items-center gap-2">
                                                                <span className="bg-slate-200 text-slate-600 text-[10px] font-bold px-1.5 py-0.5 rounded min-w-[20px] text-center">{part.qty}x</span>
                                                                {part.part_name}
                                                            </span>
                                                            <span className="font-mono text-slate-500 text-xs">${part.cost * part.qty}</span>
                                                        </li>
                                                    ))}
                                                    <li className="pt-3 mt-3 border-t border-gray-200/60 flex justify-between items-center">
                                                        <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">{t('history.total_cost')}</span>
                                                        <span className="font-bold text-emerald-600 text-base">${job.parts_used.reduce((acc, p) => acc + (p.cost * p.qty), 0).toFixed(2)}</span>
                                                    </li>
                                                </ul>
                                            )}
                                         </>
                                     )}
                                </div>
                            </div>
                        </div>
                    </div>
                );
            })}
        </div>
    </div>
  );
};
