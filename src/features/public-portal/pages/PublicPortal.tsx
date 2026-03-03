import React, { useState } from 'react';
import { useLanguage } from '@/shared/i18n/LanguageContext';
import { useJobs } from '@/features/jobs/state/JobContext';
import { JobStatus, JobPriority, JobType } from '@/shared/types';
import { CheckCircle2, Send, Building2, User, Mail, Phone, FileText } from 'lucide-react';
import { useResources } from '@/features/resources/state/ResourceContext';

export const PublicPortal: React.FC = () => {
  const { t } = useLanguage();
  const { addJob } = useJobs();
  const { customers } = useResources();
  const [submitted, setSubmitted] = useState(false);
  const [submittedId, setSubmittedId] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    companyName: '',
    contactName: '',
    email: '',
    phone: '',
    description: ''
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setSubmitError(null);

    try {
      const created = await addJob({
        customer_id: customers[0]?.id ?? '',
        status: JobStatus.WEB_PENDING,
        priority: JobPriority.NORMAL,
        job_type: JobType.FIELD,
        title: formData.description.slice(0, 80) || t('jobs.web_request'),
        description: formData.description,
        scheduled_start: new Date().toISOString(),
        contact_name: formData.contactName,
        contact_email: formData.email,
        contact_phone: formData.phone,
      });

      if (!created?.id) {
        throw new Error('Submission did not return a valid job ID.');
      }

      setSubmittedId(created.id);
      setSubmitted(true);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : t('portal.submit_error'));
    } finally {
      setLoading(false);
    }
  };

  if (submitted) {
    return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4 font-sans">
            <div className="bg-white max-w-md w-full p-8 rounded-2xl shadow-xl text-center border border-gray-100">
                <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-6">
                    <CheckCircle2 className="w-8 h-8 text-emerald-600" />
                </div>
                <h2 className="text-2xl font-bold text-slate-900 mb-2">{t('portal.success_title')}</h2>
                <p className="text-slate-500 mb-6">{t('portal.success_desc')} <span className="font-mono font-bold text-slate-800 bg-gray-100 px-2 py-1 rounded">{submittedId}</span></p>
                
                <button 
                    onClick={() => {
                        setSubmitted(false);
                        setFormData({ companyName: '', contactName: '', email: '', phone: '', description: '' });
                    }}
                    className="text-docuraft-navy font-semibold hover:underline"
                >
                    {t('portal.new_request')}
                </button>
            </div>
        </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4 font-sans">
      <div className="max-w-lg w-full bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden">
         <div className="bg-docuraft-navy p-8 text-white">
             <h1 className="text-2xl font-bold mb-2">{t('portal.title')}</h1>
             <p className="text-blue-100/80 text-sm">{t('portal.subtitle')}</p>
         </div>

         <form onSubmit={handleSubmit} className="p-8 space-y-5">
            <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2 flex items-center gap-2">
                    <Building2 className="w-4 h-4 text-slate-400" /> {t('portal.form.company')}
                </label>
                <input 
                    required
                    type="text" 
                    value={formData.companyName}
                    onChange={e => setFormData({...formData, companyName: e.target.value})}
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-docuraft-navy/20 focus:bg-white transition-all"
                />
            </div>

            <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2 flex items-center gap-2">
                    <User className="w-4 h-4 text-slate-400" /> {t('portal.form.contact')}
                </label>
                <input 
                    required
                    type="text" 
                    value={formData.contactName}
                    onChange={e => setFormData({...formData, contactName: e.target.value})}
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-docuraft-navy/20 focus:bg-white transition-all"
                />
            </div>

            <div className="grid grid-cols-2 gap-4">
                <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2 flex items-center gap-2">
                        <Mail className="w-4 h-4 text-slate-400" /> {t('portal.form.email')}
                    </label>
                    <input 
                        required
                        type="email" 
                        value={formData.email}
                        onChange={e => setFormData({...formData, email: e.target.value})}
                        className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-docuraft-navy/20 focus:bg-white transition-all"
                    />
                </div>
                <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2 flex items-center gap-2">
                        <Phone className="w-4 h-4 text-slate-400" /> {t('portal.form.phone')}
                    </label>
                    <input 
                        required
                        type="tel" 
                        value={formData.phone}
                        onChange={e => setFormData({...formData, phone: e.target.value})}
                        className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-docuraft-navy/20 focus:bg-white transition-all"
                    />
                </div>
            </div>

            <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2 flex items-center gap-2">
                    <FileText className="w-4 h-4 text-slate-400" /> {t('portal.form.desc')}
                </label>
                <textarea 
                    required
                    value={formData.description}
                    onChange={e => setFormData({...formData, description: e.target.value})}
                    placeholder={t('portal.form.desc_ph')}
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-docuraft-navy/20 focus:bg-white transition-all min-h-[120px]"
                />
            </div>

            {submitError && (
                <div className="px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
                    {submitError}
                </div>
            )}

            <button
                type="submit"
                disabled={loading}
                className="w-full py-3.5 bg-docuraft-navy text-white font-bold rounded-xl shadow-lg shadow-blue-900/20 hover:bg-slate-800 transition-all active:scale-[0.98] disabled:opacity-70 flex items-center justify-center gap-2"
            >
                {loading ? (
                    t('portal.submitting')
                ) : (
                    <>
                        <Send className="w-5 h-5" />
                        {t('portal.submit')}
                    </>
                )}
            </button>
         </form>
      </div>
      <div className="mt-8 text-center text-slate-400 text-sm">
        {t('portal.powered_by')}
      </div>
    </div>
  );
};
