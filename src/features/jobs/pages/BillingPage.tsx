import React, { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  BadgeCheck,
  Clock,
  Edit2,
  FileText,
  Package,
  Plus,
  Receipt,
  RotateCcw,
  Save,
  Send,
  Trash2,
  X,
} from 'lucide-react';
import { BillingStatus, WorkOrder, WorkOrderPartLog, WorkOrderTimeLog } from '@/shared/types';
import { useLanguage } from '@/shared/i18n/LanguageContext';
import { useJobs } from '@/features/jobs/state/JobContext';
import { useResources } from '@/features/resources/state/ResourceContext';

type BillingTabId = 'ready' | 'sent' | 'invoiced';

const TAB_TO_STATUS: Record<BillingTabId, BillingStatus> = {
  ready: BillingStatus.READY,
  sent: BillingStatus.SENT,
  invoiced: BillingStatus.INVOICED,
};

interface EditPayload {
  id: string;
  report: string;
  time_log: WorkOrderTimeLog[];
  parts_used: WorkOrderPartLog[];
}

export const BillingPage: React.FC = () => {
  const { t, language } = useLanguage();
  const { jobs, saveBillableDetails, setBillingStatus } = useJobs();
  const { getCustomerById } = useResources();
  const [searchParams, setSearchParams] = useSearchParams();
  const [editingJobId, setEditingJobId] = useState<string | null>(null);
  const [editData, setEditData] = useState<EditPayload>({ id: '', report: '', time_log: [], parts_used: [] });
  const locale = language === 'sv' ? 'sv-SE' : 'en-US';
  const currency = language === 'sv' ? 'SEK' : 'USD';
  const currencyFormatter = useMemo(
    () =>
      new Intl.NumberFormat(locale, {
        style: 'currency',
        currency,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }),
    [locale, currency],
  );

  const activeTabId = (searchParams.get('tab') ?? 'ready') as BillingTabId;
  const safeTabId: BillingTabId = activeTabId in TAB_TO_STATUS ? activeTabId : 'ready';
  const activeStatus = TAB_TO_STATUS[safeTabId];

  const counts = useMemo(
    () => ({
      ready: jobs.filter((job) => job.billing_status === BillingStatus.READY).length,
      sent: jobs.filter((job) => job.billing_status === BillingStatus.SENT).length,
      invoiced: jobs.filter((job) => job.billing_status === BillingStatus.INVOICED).length,
    }),
    [jobs],
  );

  const filteredJobs = useMemo(
    () => jobs.filter((job) => job.billing_status === activeStatus),
    [jobs, activeStatus],
  );

  const startEdit = (job: WorkOrder) => {
    setEditingJobId(job.id);
    setEditData({
      id: job.id,
      report: job.technician_report ?? '',
      time_log: (job.time_log && job.time_log.length > 0) ? [...job.time_log] : [{ description: '', minutes: 0 }],
      parts_used: (job.parts_used && job.parts_used.length > 0) ? [...job.parts_used] : [{ part_name: '', qty: 1, cost: 0 }],
    });
  };

  const cancelEdit = () => {
    setEditingJobId(null);
    setEditData({ id: '', report: '', time_log: [], parts_used: [] });
  };

  const saveEdit = async () => {
    if (!editData.id) {
      return;
    }

    await saveBillableDetails(editData.id, {
      report: editData.report,
      time_log: editData.time_log,
      parts_used: editData.parts_used,
    });

    setEditingJobId(null);
  };

  const updateTimeEntry = (index: number, field: 'description' | 'minutes', value: string | number) => {
    setEditData((prev) => {
      const next = [...prev.time_log];
      next[index] = { ...next[index], [field]: value };
      return { ...prev, time_log: next };
    });
  };

  const updatePartEntry = (index: number, field: 'part_name' | 'qty' | 'cost', value: string | number) => {
    setEditData((prev) => {
      const next = [...prev.parts_used];
      next[index] = { ...next[index], [field]: value };
      return { ...prev, parts_used: next };
    });
  };

  const removeTimeRow = (index: number) => {
    setEditData((prev) => ({ ...prev, time_log: prev.time_log.filter((_, idx) => idx !== index) }));
  };

  const removePartRow = (index: number) => {
    setEditData((prev) => ({ ...prev, parts_used: prev.parts_used.filter((_, idx) => idx !== index) }));
  };

  const addTimeRow = () => {
    setEditData((prev) => ({ ...prev, time_log: [...prev.time_log, { description: '', minutes: 0 }] }));
  };

  const addPartRow = () => {
    setEditData((prev) => ({ ...prev, parts_used: [...prev.parts_used, { part_name: '', qty: 1, cost: 0 }] }));
  };

  const formatDate = (value?: string | null) => {
    if (!value) {
      return '-';
    }
    return new Date(value).toLocaleString(locale);
  };

  const formatMoney = (value: number) => currencyFormatter.format(Number(value || 0));

  return (
    <div className="flex-1 min-h-full bg-slate-50 font-sans">
      <div className="bg-white border-b border-gray-200 px-8 py-6 shadow-sm">
        <h1 className="text-3xl font-bold text-slate-900 tracking-tight">{t('billing.title')}</h1>
        <p className="text-slate-500 text-sm mt-2">{t('billing.subtitle')}</p>
      </div>

      <div className="p-6 md:p-8 max-w-[1400px] mx-auto space-y-6">
        <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 flex items-start gap-3">
          <div className="bg-white rounded-lg p-2 text-blue-500">
            <Receipt className="w-5 h-5" />
          </div>
          <div>
            <div className="font-semibold text-blue-900">{t('billing.review_notice_title')}</div>
            <div className="text-sm text-blue-700">{t('billing.review_notice_desc')}</div>
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl p-2 inline-flex gap-2">
          <TabButton
            active={safeTabId === 'ready'}
            onClick={() => setSearchParams({ tab: 'ready' })}
            label={`${t('billing.tab.ready')} (${counts.ready})`}
          />
          <TabButton
            active={safeTabId === 'sent'}
            onClick={() => setSearchParams({ tab: 'sent' })}
            label={`${t('billing.tab.sent')} (${counts.sent})`}
          />
          <TabButton
            active={safeTabId === 'invoiced'}
            onClick={() => setSearchParams({ tab: 'invoiced' })}
            label={`${t('billing.tab.invoiced')} (${counts.invoiced})`}
          />
        </div>

        {filteredJobs.length === 0 ? (
          <div className="bg-white border border-gray-200 rounded-xl p-12 text-center text-slate-500">
            <FileText className="w-8 h-8 mx-auto mb-3 text-slate-400" />
            <p>{t('billing.no_jobs')}</p>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredJobs.map((job) => {
              const customer = getCustomerById(job.customer_id);
              const isEditing = editingJobId === job.id;
              const timeRows = isEditing ? editData.time_log : job.time_log ?? [];
              const partRows = isEditing ? editData.parts_used : job.parts_used ?? [];

              const totalMinutes = timeRows.reduce((sum, entry) => sum + Number(entry.minutes || 0), 0);
              const hours = Math.floor(totalMinutes / 60);
              const minutes = totalMinutes % 60;
              const totalPartsCost = partRows.reduce((sum, entry) => sum + Number(entry.cost || 0), 0);

              return (
                <div key={job.id} className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
                  <div className="p-5 border-b border-gray-100 bg-gray-50/70 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                    <div>
                      <div className="text-xs text-slate-500 font-mono mb-1">{job.id}</div>
                      <h3 className="font-bold text-slate-900 text-lg">{customer?.name || t('common.unknown')}</h3>
                      <p className="text-sm text-slate-500">{job.description}</p>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
                      <MetaItem label={t('billing.signature')} value={`${job.technician_signed_name || '-'} · ${formatDate(job.technician_signed_at)}`} />
                      <MetaItem label={t('billing.ready_at')} value={formatDate(job.billing_ready_at)} />
                      <MetaItem
                        label={safeTabId === 'invoiced' ? t('billing.invoiced_at') : t('billing.sent_at')}
                        value={safeTabId === 'invoiced' ? formatDate(job.invoiced_at) : formatDate(job.billing_sent_at)}
                      />
                    </div>
                  </div>

                  <div className="p-5 space-y-6">
                    <section>
                      <div className="text-xs uppercase tracking-wide text-slate-400 font-bold mb-2">{t('billing.report')}</div>
                      {isEditing ? (
                        <textarea
                          value={editData.report}
                          onChange={(event) => setEditData((prev) => ({ ...prev, report: event.target.value }))}
                          placeholder={t('billing.placeholder_report')}
                          className="w-full min-h-[120px] rounded-lg border border-gray-200 bg-white p-3 text-sm"
                        />
                      ) : (
                        <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm text-slate-700 whitespace-pre-wrap">
                          {job.technician_report || '-'}
                        </div>
                      )}
                    </section>

                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                      <section>
                        <div className="flex items-center justify-between mb-2">
                          <div className="text-xs uppercase tracking-wide text-slate-400 font-bold flex items-center gap-1.5">
                            <Clock className="w-3.5 h-3.5" />
                            {t('billing.labor')}
                          </div>
                          {isEditing && (
                            <button onClick={addTimeRow} className="text-xs text-blue-600 font-medium flex items-center gap-1">
                              <Plus className="w-3 h-3" /> {t('billing.add_time_row')}
                            </button>
                          )}
                        </div>

                        <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 space-y-2">
                          {timeRows.length === 0 && <p className="text-sm text-slate-400 italic">{t('history.no_time_logged')}</p>}
                          {timeRows.map((entry, idx) => (
                            <div key={`${job.id}-time-${idx}`} className="flex gap-2 items-center">
                              {isEditing ? (
                                <>
                                  <input
                                    type="text"
                                    value={entry.description}
                                    onChange={(event) => updateTimeEntry(idx, 'description', event.target.value)}
                                    placeholder={t('billing.time_desc')}
                                    className="flex-1 rounded-md border border-gray-200 bg-white px-3 py-2 text-sm"
                                  />
                                  <input
                                    type="number"
                                    value={entry.minutes}
                                    onChange={(event) => updateTimeEntry(idx, 'minutes', Number(event.target.value) || 0)}
                                    className="w-24 rounded-md border border-gray-200 bg-white px-3 py-2 text-sm"
                                  />
                                  <button onClick={() => removeTimeRow(idx)} className="p-2 text-slate-400 hover:text-red-500">
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </>
                              ) : (
                                <>
                                  <span className="flex-1 text-sm text-slate-700">{entry.description}</span>
                                  <span className="text-xs font-mono bg-white border border-gray-200 rounded px-2 py-1">{entry.minutes}m</span>
                                </>
                              )}
                            </div>
                          ))}

                          <div className="pt-2 border-t border-gray-200 text-sm flex justify-between font-medium">
                            <span>{t('billing.total_labor')}</span>
                            <span>{hours}h {minutes > 0 ? `${minutes}m` : ''}</span>
                          </div>
                        </div>
                      </section>

                      <section>
                        <div className="flex items-center justify-between mb-2">
                          <div className="text-xs uppercase tracking-wide text-slate-400 font-bold flex items-center gap-1.5">
                            <Package className="w-3.5 h-3.5" />
                            {t('billing.materials')}
                          </div>
                          {isEditing && (
                            <button onClick={addPartRow} className="text-xs text-blue-600 font-medium flex items-center gap-1">
                              <Plus className="w-3 h-3" /> {t('billing.add_part_row')}
                            </button>
                          )}
                        </div>

                        <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 space-y-2">
                          {partRows.length === 0 && <p className="text-sm text-slate-400 italic">{t('history.no_materials_used')}</p>}
                          {partRows.map((entry, idx) => (
                            <div key={`${job.id}-part-${idx}`} className="flex gap-2 items-center">
                              {isEditing ? (
                                <>
                                  <input
                                    type="number"
                                    value={entry.qty}
                                    onChange={(event) => updatePartEntry(idx, 'qty', Number(event.target.value) || 0)}
                                    className="w-20 rounded-md border border-gray-200 bg-white px-3 py-2 text-sm"
                                  />
                                  <input
                                    type="text"
                                    value={entry.part_name}
                                    onChange={(event) => updatePartEntry(idx, 'part_name', event.target.value)}
                                    placeholder={t('billing.part_name')}
                                    className="flex-1 rounded-md border border-gray-200 bg-white px-3 py-2 text-sm"
                                  />
                                  <input
                                    type="number"
                                    value={entry.cost}
                                    onChange={(event) => updatePartEntry(idx, 'cost', Number(event.target.value) || 0)}
                                    className="w-24 rounded-md border border-gray-200 bg-white px-3 py-2 text-sm"
                                  />
                                  <button onClick={() => removePartRow(idx)} className="p-2 text-slate-400 hover:text-red-500">
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </>
                              ) : (
                                <>
                                  <span className="text-xs font-semibold rounded bg-slate-200 text-slate-700 px-2 py-1 min-w-10 text-center">
                                    {entry.qty}x
                                  </span>
                                  <span className="flex-1 text-sm text-slate-700">{entry.part_name}</span>
                                  <span className="text-xs font-mono">{formatMoney(Number(entry.cost || 0))}</span>
                                </>
                              )}
                            </div>
                          ))}

                          <div className="pt-2 border-t border-gray-200 text-sm flex justify-between font-medium">
                            <span>{t('billing.total_parts')}</span>
                            <span>{formatMoney(totalPartsCost)}</span>
                          </div>
                        </div>
                      </section>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 pt-2">
                      {safeTabId === 'ready' && (
                        <>
                          {isEditing ? (
                            <>
                              <button
                                onClick={saveEdit}
                                className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium flex items-center gap-2"
                              >
                                <Save className="w-4 h-4" /> {t('billing.save_details')}
                              </button>
                              <button
                                onClick={cancelEdit}
                                className="px-4 py-2 rounded-lg border border-gray-200 bg-white text-sm font-medium flex items-center gap-2"
                              >
                                <X className="w-4 h-4" /> {t('common.cancel')}
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                onClick={() => startEdit(job)}
                                className="px-4 py-2 rounded-lg border border-gray-200 bg-white text-sm font-medium flex items-center gap-2"
                              >
                                <Edit2 className="w-4 h-4" /> {t('billing.edit_details')}
                              </button>
                              <button
                                onClick={() => setBillingStatus(job.id, BillingStatus.SENT)}
                                className="px-4 py-2 rounded-lg bg-docuraft-navy text-white text-sm font-medium flex items-center gap-2"
                              >
                                <Send className="w-4 h-4" /> {t('billing.send_invoice')}
                              </button>
                            </>
                          )}
                        </>
                      )}

                      {safeTabId === 'sent' && (
                        <>
                          <button
                            onClick={() => setBillingStatus(job.id, BillingStatus.READY)}
                            className="px-4 py-2 rounded-lg border border-gray-200 bg-white text-sm font-medium flex items-center gap-2"
                          >
                            <RotateCcw className="w-4 h-4" /> {t('billing.reopen')}
                          </button>
                          <button
                            onClick={() => setBillingStatus(job.id, BillingStatus.INVOICED)}
                            className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium flex items-center gap-2"
                          >
                            <BadgeCheck className="w-4 h-4" /> {t('billing.mark_invoiced')}
                          </button>
                        </>
                      )}

                      {safeTabId === 'invoiced' && (
                        <span className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-50 text-emerald-700 text-sm font-medium border border-emerald-200">
                          <BadgeCheck className="w-4 h-4" /> {t('billing.invoice_done')}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

const TabButton: React.FC<{ active: boolean; onClick: () => void; label: string }> = ({ active, onClick, label }) => (
  <button
    onClick={onClick}
    className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
      active ? 'bg-docuraft-navy text-white' : 'bg-white text-slate-600 hover:bg-slate-100'
    }`}
  >
    {label}
  </button>
);

const MetaItem: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="bg-white border border-gray-200 rounded-lg px-3 py-2">
    <div className="text-[10px] uppercase tracking-wide text-slate-400 font-bold mb-1">{label}</div>
    <div className="text-xs text-slate-700 font-medium">{value}</div>
  </div>
);
