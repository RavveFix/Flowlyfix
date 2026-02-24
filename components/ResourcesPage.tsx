import React, { useMemo, useState } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { useResources } from '../contexts/ResourceContext';
import { Search, Plus, Trash2, Box, Users, Upload } from 'lucide-react';
import { Asset, CsvImportResult } from '../types';
import { parseCsvRows } from '../lib/csv';

export const ResourcesPage: React.FC = () => {
  const { t } = useLanguage();
  const {
    assets,
    technicians,
    addAsset,
    deleteAsset,
    deleteTechnician,
    customers,
    inviteTechnician,
    importCustomersAssets,
  } = useResources();

  const [activeTab, setActiveTab] = useState<'assets' | 'techs'>('assets');
  const [searchTerm, setSearchTerm] = useState('');

  const [isAssetModalOpen, setIsAssetModalOpen] = useState(false);
  const [newAsset, setNewAsset] = useState<Partial<Asset>>({ model: '', serial_number: '', location_in_building: '' });
  const [selectedCustomerId, setSelectedCustomerId] = useState('');

  const [isTechModalOpen, setIsTechModalOpen] = useState(false);
  const [newTechName, setNewTechName] = useState('');
  const [newTechEmail, setNewTechEmail] = useState('');

  const [isImportOpen, setIsImportOpen] = useState(false);
  const [csvText, setCsvText] = useState('');
  const [importResult, setImportResult] = useState<CsvImportResult | null>(null);
  const [isImporting, setIsImporting] = useState(false);

  const filteredAssets = useMemo(
    () =>
      assets.filter(
        (asset) =>
          asset.model.toLowerCase().includes(searchTerm.toLowerCase()) ||
          asset.serial_number.toLowerCase().includes(searchTerm.toLowerCase()),
      ),
    [assets, searchTerm],
  );

  const filteredTechs = useMemo(
    () =>
      technicians.filter(
        (technician) =>
          technician.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          technician.email.toLowerCase().includes(searchTerm.toLowerCase()),
      ),
    [technicians, searchTerm],
  );

  const handleAddAsset = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!newAsset.model || !newAsset.serial_number || !selectedCustomerId) return;

    await addAsset({
      customer_id: selectedCustomerId,
      name: newAsset.model,
      model: newAsset.model,
      serial_number: newAsset.serial_number,
      location_in_building: newAsset.location_in_building,
    });

    setIsAssetModalOpen(false);
    setNewAsset({ model: '', serial_number: '', location_in_building: '' });
  };

  const handleInviteTechnician = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!newTechName || !newTechEmail) return;

    try {
      await inviteTechnician({
        full_name: newTechName,
        email: newTechEmail,
      });
      setIsTechModalOpen(false);
      setNewTechName('');
      setNewTechEmail('');
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to invite technician');
    }
  };

  const handleCsvUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const text = await file.text();
    setCsvText(text);
  };

  const runImport = async (dryRun: boolean) => {
    setIsImporting(true);
    try {
      const rows = parseCsvRows(csvText);
      const result = await importCustomersAssets(rows, dryRun);
      setImportResult(result);
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Import failed');
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div className="flex-1 bg-slate-50 min-h-full font-sans">
      <div className="bg-white border-b border-gray-200 px-8 py-5 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{t('resources.title')}</h1>
          <p className="text-slate-500 text-sm mt-1">{t('resources.subtitle')}</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder={t('customers.search_placeholder')}
              className="pl-10 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-docuraft-navy/20 w-64"
            />
          </div>

          <button
            onClick={() => setIsImportOpen(true)}
            className="flex items-center gap-2 border border-gray-300 bg-white text-slate-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 transition"
          >
            <Upload className="w-4 h-4" />
            CSV Import
          </button>

          <button
            onClick={() => (activeTab === 'assets' ? setIsAssetModalOpen(true) : setIsTechModalOpen(true))}
            className="flex items-center gap-2 bg-docuraft-navy text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-slate-800 transition"
          >
            <Plus className="w-4 h-4" />
            {activeTab === 'assets' ? t('resources.add_asset') : t('resources.add_tech')}
          </button>
        </div>
      </div>

      <div className="p-8">
        <div className="flex gap-4 mb-6">
          <button
            onClick={() => setActiveTab('assets')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
              activeTab === 'assets' ? 'bg-white text-slate-900 shadow-sm border border-gray-200' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <Box className="w-4 h-4" />
            {t('resources.assets')}
          </button>
          <button
            onClick={() => setActiveTab('techs')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
              activeTab === 'techs' ? 'bg-white text-slate-900 shadow-sm border border-gray-200' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <Users className="w-4 h-4" />
            {t('resources.technicians')}
          </button>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          {activeTab === 'assets' ? (
            <table className="w-full text-left text-sm text-slate-600">
              <thead className="bg-gray-50 text-xs uppercase font-semibold text-slate-500">
                <tr>
                  <th className="px-6 py-4">{t('workshop.model')}</th>
                  <th className="px-6 py-4">{t('workshop.serial')}</th>
                  <th className="px-6 py-4">{t('table.customer')}</th>
                  <th className="px-6 py-4 text-right">{t('table.actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredAssets.map((asset) => (
                  <tr key={asset.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 font-medium text-slate-900">{asset.model}</td>
                    <td className="px-6 py-4 font-mono text-xs">{asset.serial_number}</td>
                    <td className="px-6 py-4">{customers.find((customer) => customer.id === asset.customer_id)?.name || 'Unknown'}</td>
                    <td className="px-6 py-4 text-right">
                      <button onClick={() => deleteAsset(asset.id)} className="text-slate-400 hover:text-red-500 transition-colors">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
                {filteredAssets.length === 0 && (
                  <tr>
                    <td colSpan={4} className="p-8 text-center text-slate-400 italic">
                      {t('customers.no_customers')}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          ) : (
            <table className="w-full text-left text-sm text-slate-600">
              <thead className="bg-gray-50 text-xs uppercase font-semibold text-slate-500">
                <tr>
                  <th className="px-6 py-4">{t('settings.table.user')}</th>
                  <th className="px-6 py-4">Email</th>
                  <th className="px-6 py-4 text-right">{t('table.actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredTechs.map((tech) => (
                  <tr key={tech.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center font-bold text-slate-600">
                          {tech.full_name.charAt(0)}
                        </div>
                        <span className="font-medium text-slate-900">{tech.full_name}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm">{tech.email}</td>
                    <td className="px-6 py-4 text-right">
                      <button onClick={() => deleteTechnician(tech.id)} className="text-slate-400 hover:text-red-500 transition-colors">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
                {filteredTechs.length === 0 && (
                  <tr>
                    <td colSpan={3} className="p-8 text-center text-slate-400 italic">
                      {t('customers.no_customers')}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {isAssetModalOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
            <h2 className="text-xl font-bold mb-4">{t('resources.add_asset')}</h2>
            <form onSubmit={handleAddAsset} className="space-y-4">
              <div>
                <label className="block text-sm font-semibold mb-1">{t('workshop.model')}</label>
                <input
                  type="text"
                  className="w-full p-2 border rounded-lg"
                  value={newAsset.model}
                  onChange={(event) => setNewAsset({ ...newAsset, model: event.target.value })}
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-semibold mb-1">{t('workshop.serial')}</label>
                <input
                  type="text"
                  className="w-full p-2 border rounded-lg"
                  value={newAsset.serial_number}
                  onChange={(event) => setNewAsset({ ...newAsset, serial_number: event.target.value })}
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-semibold mb-1">{t('table.customer')}</label>
                <select className="w-full p-2 border rounded-lg" value={selectedCustomerId} onChange={(event) => setSelectedCustomerId(event.target.value)}>
                  <option value="">Select customer</option>
                  {customers.map((customer) => (
                    <option key={customer.id} value={customer.id}>
                      {customer.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex justify-end gap-2 mt-6">
                <button type="button" onClick={() => setIsAssetModalOpen(false)} className="px-4 py-2 border rounded-lg">
                  {t('common.cancel')}
                </button>
                <button type="submit" className="px-4 py-2 bg-docuraft-navy text-white rounded-lg">
                  {t('common.save')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {isTechModalOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
            <h2 className="text-xl font-bold mb-4">{t('resources.add_tech')}</h2>
            <form onSubmit={handleInviteTechnician} className="space-y-4">
              <div>
                <label className="block text-sm font-semibold mb-1">{t('settings.table.user')}</label>
                <input
                  type="text"
                  className="w-full p-2 border rounded-lg"
                  value={newTechName}
                  onChange={(event) => setNewTechName(event.target.value)}
                  required
                  placeholder="Full name"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold mb-1">Email</label>
                <input
                  type="email"
                  className="w-full p-2 border rounded-lg"
                  value={newTechEmail}
                  onChange={(event) => setNewTechEmail(event.target.value)}
                  required
                  placeholder="tech@company.com"
                />
              </div>
              <div className="flex justify-end gap-2 mt-6">
                <button type="button" onClick={() => setIsTechModalOpen(false)} className="px-4 py-2 border rounded-lg">
                  {t('common.cancel')}
                </button>
                <button type="submit" className="px-4 py-2 bg-docuraft-navy text-white rounded-lg">
                  Invite
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {isImportOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl p-6">
            <h2 className="text-xl font-bold mb-3">CSV Import</h2>
            <p className="text-sm text-slate-500 mb-4">
              Expected headers: customer_name, customer_org_number, customer_address, contact_person, contact_phone,
              contact_email, asset_name, asset_model, asset_serial_number, asset_location
            </p>

            <input type="file" accept=".csv" onChange={handleCsvUpload} className="mb-3" />
            <textarea
              value={csvText}
              onChange={(event) => setCsvText(event.target.value)}
              className="w-full min-h-[180px] p-3 border rounded-lg text-sm"
              placeholder="Paste CSV here..."
            />

            {importResult && (
              <div className="mt-4 rounded-lg border border-slate-200 p-3 text-sm">
                <div>Created: {importResult.created}</div>
                <div>Updated: {importResult.updated}</div>
                <div>Failed: {importResult.failed.length}</div>
                {importResult.failed.length > 0 && (
                  <ul className="mt-2 max-h-24 overflow-auto text-xs text-red-600">
                    {importResult.failed.map((failure, idx) => (
                      <li key={idx}>
                        Row {failure.row}: {failure.error}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            <div className="mt-4 flex justify-between items-center gap-2">
              <button onClick={() => setIsImportOpen(false)} className="px-4 py-2 border rounded-lg">
                Close
              </button>
              <div className="flex gap-2">
                <button
                  onClick={() => runImport(true)}
                  disabled={isImporting || !csvText.trim()}
                  className="px-4 py-2 border rounded-lg"
                >
                  {isImporting ? 'Running...' : 'Dry run'}
                </button>
                <button
                  onClick={() => runImport(false)}
                  disabled={isImporting || !csvText.trim()}
                  className="px-4 py-2 bg-docuraft-navy text-white rounded-lg"
                >
                  {isImporting ? 'Importing...' : 'Import'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
