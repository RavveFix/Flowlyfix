import React, { useState } from 'react';
import { X, Cpu } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import { JobPriority, JobStatus, JobType, WorkOrder } from '../types';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { useResources } from '../contexts/ResourceContext';
import { useJobs } from '../contexts/JobContext';

interface CheckInModalProps {
  onClose: () => void;
  onJobCreated: (job: WorkOrder) => void;
}

export const CheckInModal: React.FC<CheckInModalProps> = ({ onClose, onJobCreated }) => {
  const { t } = useLanguage();
  const { customers, addAsset } = useResources();
  const { addJob } = useJobs();

  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    customerId: '',
    model: '',
    serialNumber: '',
    description: '',
  });

  const handleSubmit = async (event?: React.FormEvent | React.MouseEvent) => {
    event?.preventDefault();
    setLoading(true);

    try {
      if (!formData.customerId || !formData.model.trim() || !formData.serialNumber.trim()) {
        return;
      }

      const createdAsset = await addAsset({
        customer_id: formData.customerId,
        name: formData.model,
        model: formData.model,
        serial_number: formData.serialNumber,
      });

      const created = await addJob({
        customer_id: formData.customerId,
        asset_id: createdAsset?.id ?? null,
        status: JobStatus.WORKSHOP_RECEIVED,
        priority: JobPriority.NORMAL,
        job_type: JobType.WORKSHOP,
        title: `${formData.model} (${formData.serialNumber})`,
        description: formData.description,
        scheduled_start: new Date().toISOString(),
      });

      if (created) {
        onJobCreated(created);
        onClose();
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
        <div className="px-6 py-5 border-b border-gray-100 flex justify-between items-center bg-gray-50">
          <div className="flex items-center gap-2">
            <div className="bg-docuraft-navy/10 p-2 rounded-lg">
              <Cpu className="w-5 h-5 text-docuraft-navy" />
            </div>
            <h2 className="text-xl font-bold text-slate-900">{t('workshop.check_in_title')}</h2>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
            <X className="w-6 h-6" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-6">
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">{t('ticket.select_customer')}</label>
            <Select
              value={formData.customerId}
              onValueChange={(value) => setFormData((prev) => ({ ...prev, customerId: value }))}
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

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">{t('workshop.model')}</label>
              <Input
                type="text"
                value={formData.model}
                onChange={(event) => setFormData((prev) => ({ ...prev, model: event.target.value }))}
                className="w-full bg-white transition-all rounded-xl focus-visible:ring-docuraft-navy/20 h-[46px]"
                placeholder={t('checkin.placeholder_model')}
                required
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">{t('workshop.serial')}</label>
              <Input
                type="text"
                value={formData.serialNumber}
                onChange={(event) => setFormData((prev) => ({ ...prev, serialNumber: event.target.value }))}
                className="w-full bg-white transition-all rounded-xl focus-visible:ring-docuraft-navy/20 h-[46px]"
                placeholder={t('checkin.placeholder_serial')}
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">{t('workshop.issue')}</label>
            <Textarea
              value={formData.description}
              onChange={(event) => setFormData((prev) => ({ ...prev, description: event.target.value }))}
              className="w-full bg-white transition-all rounded-xl focus-visible:ring-docuraft-navy/20 min-h-[100px]"
              placeholder={t('checkin.placeholder_desc')}
              required
            />
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
            {loading ? t('ticket.creating') : t('workshop.check_in')}
          </Button>
        </div>
      </div>
    </div>
  );
};
