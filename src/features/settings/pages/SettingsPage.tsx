import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Save, RefreshCw, CheckCircle2, Shield, CreditCard, Users, Globe, Building, Mail, Zap } from 'lucide-react';
import { syncCustomers } from '@/features/integrations/fortnox/client';
import { useLanguage } from '@/shared/i18n/LanguageContext';

export const SettingsPage: React.FC = () => {
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSynced, setLastSynced] = useState<string | null>(null);
  const [orgName, setOrgName] = useState("Flowlyfix Inc.");
  const navigate = useNavigate();
  const { language, setLanguage, t } = useLanguage();
  
  const handleSync = async () => {
    setIsSyncing(true);
    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 2000));
    await syncCustomers(); // Call mock service
    setLastSynced(t('settings.just_now'));
    setIsSyncing(false);
  };

  return (
    <div className="flex-1 bg-[#f8fafc] min-h-full font-sans">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-8 py-6 shadow-sm">
        <h1 className="text-3xl font-bold text-slate-900 tracking-tight">{t('settings.title')}</h1>
        <p className="text-slate-500 text-sm mt-2 max-w-2xl">{t('settings.subtitle')}</p>
      </div>

      <div className="p-8 max-w-6xl mx-auto space-y-8">

        {/* Top Row: Language & Integrations */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            
            {/* Language Settings */}
            <section className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden flex flex-col">
              <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/50">
                <h3 className="font-semibold text-slate-800 flex items-center gap-2">
                  <Globe className="w-4 h-4 text-slate-500" /> {t('settings.language')}
                </h3>
              </div>
              <div className="p-6 flex-1 flex flex-col justify-center">
                <p className="text-sm text-slate-500 mb-4">{t('settings.select_language')}</p>
                <div className="flex bg-gray-100/80 p-1.5 rounded-xl">
                  <button 
                    onClick={() => setLanguage('en')}
                    className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all duration-200 ${language === 'en' ? 'bg-white text-slate-900 shadow-md ring-1 ring-black/5' : 'text-slate-500 hover:text-slate-700'}`}
                  >
                    English
                  </button>
                  <button 
                    onClick={() => setLanguage('sv')}
                    className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all duration-200 ${language === 'sv' ? 'bg-white text-slate-900 shadow-md ring-1 ring-black/5' : 'text-slate-500 hover:text-slate-700'}`}
                  >
                    Svenska
                  </button>
                </div>
              </div>
            </section>
            
            {/* Integrations Card */}
            <section className="lg:col-span-2 bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/50 flex justify-between items-center">
                <h3 className="font-semibold text-slate-800 flex items-center gap-2">
                  <Zap className="w-4 h-4 text-amber-500" /> {t('settings.integrations')}
                </h3>
                <span className="px-3 py-1 bg-emerald-50 text-emerald-700 text-xs font-bold rounded-full border border-emerald-100 flex items-center gap-1.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></div>
                  {t('settings.system_operational')}
                </span>
              </div>
              <div className="p-6">
                <div className="flex flex-col sm:flex-row items-start justify-between gap-6">
                  <div className="flex gap-5">
                    <div className="w-14 h-14 bg-[#0f766e] rounded-xl flex items-center justify-center text-white font-bold text-2xl shadow-lg shadow-emerald-900/20">
                      E
                    </div>
                    <div>
                      <h4 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                          {t('settings.plan_feature_2')}
                          <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                      </h4>
                      <p className="text-sm text-slate-500 max-w-md mt-1 leading-relaxed">
                        {t('settings.fortnox_desc')}
                      </p>
                      <div className="flex items-center gap-4 mt-4 text-xs font-medium text-slate-500">
                        <span className="px-2 py-0.5 rounded bg-gray-100 text-slate-600 border border-gray-200">{t('settings.connected')}</span>
                        <span className="text-slate-400">•</span>
                        <span>{t('settings.last_synced')}: <span className="text-slate-700">{lastSynced || t('settings.sample_last_synced')}</span></span>
                      </div>
                    </div>
                  </div>
                  <button 
                    onClick={handleSync}
                    disabled={isSyncing}
                    className="w-full sm:w-auto px-5 py-2.5 bg-white border border-gray-200 text-slate-700 font-semibold rounded-xl hover:bg-gray-50 hover:border-gray-300 transition-all flex items-center justify-center gap-2 disabled:opacity-70 shadow-sm"
                  >
                    <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin text-emerald-600' : 'text-slate-400'}`} />
                    {isSyncing ? t('settings.syncing') : t('settings.sync_now')}
                  </button>
                </div>
                
                <div className="mt-8 pt-6 border-t border-gray-100 grid grid-cols-1 md:grid-cols-2 gap-4">
                   <div className="flex items-center justify-between p-4 bg-gray-50/80 rounded-xl border border-gray-100">
                      <span className="text-sm font-medium text-slate-700">{t('settings.auto_sync')}</span>
                      <ToggleSwitch checked={true} />
                   </div>
                   <div className="flex items-center justify-between p-4 bg-gray-50/80 rounded-xl border border-gray-100">
                      <span className="text-sm font-medium text-slate-700">{t('settings.draft_invoice')}</span>
                      <ToggleSwitch checked={true} />
                   </div>
                </div>
              </div>
            </section>
        </div>

        {/* Main Settings Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
           
           {/* Profile / Org - Styled Darker based on screenshot preference */}
           <section className="md:col-span-2 bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden flex flex-col">
              <div className="px-6 py-5 border-b border-gray-100 bg-white">
                <h3 className="font-bold text-lg text-slate-900 flex items-center gap-2">
                  <Shield className="w-5 h-5 text-slate-400" /> {t('settings.org_profile')}
                </h3>
              </div>
              
              <div className="p-8 space-y-6 flex-1">
                <div className="grid grid-cols-1 gap-6">
                    <div>
                       <label className="block text-sm font-semibold text-slate-700 mb-2 flex items-center gap-2">
                            <Building className="w-4 h-4 text-slate-400" />
                            {t('settings.org_name')}
                       </label>
                       <input 
                          type="text" 
                          value={orgName}
                          onChange={(e) => setOrgName(e.target.value)}
                          className="w-full px-4 py-3 bg-slate-800 border-transparent rounded-xl text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-slate-700 transition-all shadow-inner font-medium tracking-wide"
                       />
                    </div>
                    <div>
                       <label className="block text-sm font-semibold text-slate-700 mb-2 flex items-center gap-2">
                            <Mail className="w-4 h-4 text-slate-400" />
                            {t('settings.support_email')}
                       </label>
                       <input 
                          type="email" 
                          defaultValue="support@flowly.com"
                          className="w-full px-4 py-3 bg-slate-800 border-transparent rounded-xl text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-slate-700 transition-all shadow-inner font-medium tracking-wide"
                       />
                    </div>
                </div>
                
                <div className="pt-4">
                   <button className="px-6 py-3 bg-[#0a192f] text-white font-semibold rounded-xl hover:bg-slate-800 hover:shadow-lg hover:shadow-slate-900/20 active:scale-[0.98] transition-all flex items-center gap-2.5">
                     <Save className="w-5 h-5" /> {t('settings.save_changes')}
                   </button>
                </div>
              </div>
           </section>

           {/* Subscription Plan */}
           <section className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden h-fit">
              <div className="px-6 py-5 border-b border-gray-100 bg-gradient-to-r from-docuraft-navy to-slate-800 text-white">
                <h3 className="font-semibold flex items-center gap-2">
                  <CreditCard className="w-4 h-4 text-emerald-400" /> {t('settings.subscription')}
                </h3>
              </div>
              <div className="p-6">
                <div className="mb-6">
                  <span className="inline-block px-2 py-1 rounded bg-emerald-100 text-emerald-800 text-[10px] font-bold uppercase tracking-wider mb-2">{t('settings.plan_active')}</span>
                  <div className="text-3xl font-bold text-slate-900">{t('settings.plan_name')}</div>
                  <p className="text-sm text-slate-500 font-medium">{t('settings.plan_price')}</p>
                </div>
                <div className="space-y-3 mb-8">
                   <div className="flex items-center gap-3 text-sm text-slate-600">
                      <div className="w-5 h-5 rounded-full bg-emerald-100 flex items-center justify-center shrink-0">
                          <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                      </div>
                      {t('settings.plan_feature_1')}
                   </div>
                   <div className="flex items-center gap-3 text-sm text-slate-600">
                      <div className="w-5 h-5 rounded-full bg-emerald-100 flex items-center justify-center shrink-0">
                          <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                      </div>
                      {t('settings.plan_feature_2')}
                   </div>
                   <div className="flex items-center gap-3 text-sm text-slate-600">
                      <div className="w-5 h-5 rounded-full bg-emerald-100 flex items-center justify-center shrink-0">
                          <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                      </div>
                      {t('settings.plan_feature_3')}
                   </div>
                </div>
                <button
                  onClick={() => navigate('/admin/billing')}
                  className="w-full py-3 border border-gray-200 rounded-xl text-sm font-bold text-slate-700 hover:bg-slate-50 hover:text-slate-900 transition-colors shadow-sm"
                >
                    {t('settings.manage_billing')}
                </button>
              </div>
           </section>
        </div>
        
        <section className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="px-8 py-6 border-b border-gray-100 flex justify-between items-center bg-white">
            <div>
              <h3 className="font-bold text-lg text-slate-900 flex items-center gap-2">
                <Users className="w-5 h-5 text-slate-400" /> {t('settings.team_members')}
              </h3>
              <p className="text-xs text-slate-400 mt-1">{t('settings.manage_access_desc')}</p>
            </div>
            <button
              onClick={() => navigate('/admin/resources')}
              className="text-sm bg-indigo-50 text-indigo-700 px-4 py-2 rounded-lg font-semibold hover:bg-indigo-100 transition-colors"
            >
              Öppna accesshantering
            </button>
          </div>
          <div className="px-8 py-6 text-sm text-slate-600">
            Team och inbjudningar hanteras nu i Resurser-fliken med roller, status och pending invites.
          </div>
        </section>

      </div>
    </div>
  );
};

const ToggleSwitch = ({ checked }: { checked: boolean }) => (
  <div className={`w-12 h-7 flex items-center rounded-full p-1 cursor-pointer transition-colors duration-300 ${checked ? 'bg-[#0a192f]' : 'bg-gray-300'}`}>
    <div className={`bg-white w-5 h-5 rounded-full shadow-md transform transition-transform duration-300 ${checked ? 'translate-x-5' : ''}`}></div>
  </div>
);
