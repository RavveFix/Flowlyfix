import React, { useMemo, useState } from 'react';
import { X, AlertCircle } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import { JobPriority, JobStatus, JobType, WorkOrder } from '../types';
import { TranslationKey } from '../i18n/translations';
import { Button } from './ui/button';
import { Textarea } from './ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { useResources } from '../contexts/ResourceContext';
import { useJobs } from '../contexts/JobContext';

interface CreateTicketModalProps {
  onClose: () => void;
  onJobCreated: (job: WorkOrder) => void;
}

export const CreateTicketModal: React.FC<CreateTicketModalProps> = ({ onClose, onJobCreated }) => {
  const { t } = useLanguage();
  const { customers, assets, technicians } = useResources();
  const { addJob } = useJobs();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    customerId: '',
    assetId: '',
    description: '',
    priority: JobPriority.NORMAL,
    assignedTechnicianId: '',
  });

  const availableAssets = useMemo(
    () => assets.filter((asset) => asset.customer_id === formData.customerId),
    [assets, formData.customerId],
  );

  const handleSubmit = async (event?: React.FormEvent | React.MouseEvent) => {
    event?.preventDefault();
    setError(null);
    setLoading(true);

    if (!formData.customerId || !formData.description.trim()) {
      setError(t('ticket.error_generic'));
      setLoading(false);
      return;
    }

    try {
      const created = await addJob({
        customer_id: formData.customerId,
        asset_id: formData.assetId || null,
        assigned_to_user_id: formData.assignedTechnicianId || null,
        status: formData.assignedTechnicianId ? JobStatus.ASSIGNED : JobStatus.OPEN,
        priority: formData.priority,
        job_type: JobType.FIELD,
        title: formData.description.slice(0, 80) || 'New service case',
        description: formData.description,
        scheduled_start: new Date().toISOString(),
      });

      if (!created) {
        setError(t('ticket.error_generic'));
        return;
      }

      onJobCreated(created);
      onClose();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : t('ticket.error_generic'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
        <div className="px-6 py-5 border-b border-gray-100 flex justify-between items-center bg-gray-50">
          <h2 className="text-xl font-bold text-slate-900">{t('ticket.create_title')}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
            <X className="w-6 h-6" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-6">
          {error && (
            <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm flex items-center gap-2">
              <AlertCircle className="w-4 h-4" />
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">{t('ticket.select_customer')}</label>
            <Select
              value={formData.customerId}
              onValueChange={(value) => setFormData((prev) => ({ ...prev, customerId: value, assetId: '' }))}
              required
            >
              <SelectTrigger className="w-full bg-white transition-all rounded-xl focus:ring-docuraft-navy/20 focus:border-docuraft-navy">
                <SelectValue placeholder={t('ticket.select_customer')} />
              </SelectTrigger>
              <SelectContent>
                {customers.map((customer) => (
                  <SelectItem key={customer.id} value={customer.id}>
                    {customer.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">{t('ticket.select_asset')}</label>
            <Select
              value={formData.assetId}
              onValueChange={(value) => setFormData((prev) => ({ ...prev, assetId: value }))}
              disabled={!formData.customerId}
            >
              <SelectTrigger className="w-full bg-white transition-all rounded-xl focus:ring-docuraft-navy/20 focus:border-docuraft-navy disabled:bg-gray-100">
                <SelectValue
                  placeholder={formData.customerId ? t('ticket.select_asset') : t('ticket.select_customer_first')}
                />
              </SelectTrigger>
              <SelectContent>
                {availableAssets.map((asset) => (
                  <SelectItem key={asset.id} value={asset.id}>
                    {asset.model} (SN: {asset.serial_number})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">{t('ticket.description')}</label>
            <Textarea
              value={formData.description}
              onChange={(event) => setFormData((prev) => ({ ...prev, description: event.target.value }))}
              className="w-full bg-white rounded-xl focus-visible:ring-docuraft-navy/20 min-h-[100px] transition-all"
              placeholder={t('ticket.placeholder_desc')}
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">{t('ticket.priority')}</label>
              <Select
                value={formData.priority}
                onValueChange={(value) => setFormData((prev) => ({ ...prev, priority: value as JobPriority }))}
              >
                <SelectTrigger className="w-full bg-white transition-all rounded-xl focus:ring-docuraft-navy/20 focus:border-docuraft-navy">
                  <SelectValue placeholder={t('ticket.priority')} />
                </SelectTrigger>
                <SelectContent>
                  {Object.values(JobPriority).map((priority) => (
                    <SelectItem key={priority} value={priority}>
                      {t(`priority.${priority}` as TranslationKey)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">{t('ticket.assign_tech')}</label>
              <Select
                value={formData.assignedTechnicianId}
                onValueChange={(value) =>
                  setFormData((prev) => ({ ...prev, assignedTechnicianId: value === 'unassigned' ? '' : value }))
                }
              >
                <SelectTrigger className="w-full bg-white transition-all rounded-xl focus:ring-docuraft-navy/20 focus:border-docuraft-navy">
                  <SelectValue placeholder={t('ticket.assign_tech')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="unassigned">{t('ticket.unassigned')}</SelectItem>
                  {technicians.map((technician) => (
                    <SelectItem key={technician.id} value={technician.id}>
                      {technician.full_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </form>

        <div className="p-6 border-t border-gray-100 bg-gray-50 flex justify-end gap-3">
          <Button onClick={onClose} type="button" variant="outline" className="rounded-xl px-5 py-5 text-slate-700">
            {t('dispatch.cancel')}
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={loading}
            className="bg-docuraft-navy hover:bg-slate-800 text-white rounded-xl px-6 py-5 flex items-center gap-2"
          >
            {loading ? t('ticket.creating') : t('ticket.create_btn')}
          </Button>
        </div>
      </div>
    </div>
  );
};
