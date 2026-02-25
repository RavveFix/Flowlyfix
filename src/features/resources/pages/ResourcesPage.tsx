import React, { useMemo, useRef, useState } from 'react';
import { useLanguage } from '@/shared/i18n/LanguageContext';
import { useResources } from '@/features/resources/state/ResourceContext';
import { Search, Plus, Trash2, Box, Users, Upload } from 'lucide-react';
import { Asset, CsvImportResult, UserRole } from '@/shared/types';
import { CSV_IMPORT_HEADERS, parseCsvImport } from '@/features/resources/lib/csv';

export const ResourcesPage: React.FC = () => {
  const { t } = useLanguage();
  const {
    assets,
    teamMembers,
    addAsset,
    deleteAsset,
    customers,
    inviteTechnician,
    changeUserRole,
    pendingInvites,
    revokeInvite,
    resendInvite,
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
  const [newTechRole, setNewTechRole] = useState<UserRole>(UserRole.TECHNICIAN);

  const [isImportOpen, setIsImportOpen] = useState(false);
  const [csvText, setCsvText] = useState('');
  const [importResult, setImportResult] = useState<CsvImportResult | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [selectedImportFileName, setSelectedImportFileName] = useState('');
  const [inviteInfo, setInviteInfo] = useState<string | null>(null);
  const csvFileInputRef = useRef<HTMLInputElement | null>(null);
  const hasCsvData = csvText.trim().length > 0;

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
      teamMembers.filter(
        (member) =>
          member.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          member.email.toLowerCase().includes(searchTerm.toLowerCase()),
      ),
    [teamMembers, searchTerm],
  );

  const pendingInviteEmails = useMemo(
    () => new Set(pendingInvites.filter((invite) => invite.status === 'PENDING').map((invite) => invite.email.toLowerCase())),
    [pendingInvites],
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
        role: newTechRole,
      });
      setIsTechModalOpen(false);
      setNewTechName('');
      setNewTechEmail('');
      setNewTechRole(UserRole.TECHNICIAN);
    } catch (error) {
      const message = error instanceof Error ? error.message : t('resources.invite_failed');
      if (/unauthorized|session expired|invalid jwt|jwt|401/i.test(message)) {
        alert('Sessionen har löpt ut. Logga in igen och försök på nytt.');
        return;
      }
      alert(message);
    }
  };

  const handleToggleRole = async (id: string, isAdmin: boolean) => {
    try {
      await changeUserRole(id, isAdmin ? UserRole.TECHNICIAN : UserRole.ADMIN);
    } catch (error) {
      alert(error instanceof Error ? error.message : t('resources.user_action_failed'));
    }
  };

  const handleResendInvite = async (invite: { id: string; email: string; role: UserRole }) => {
    try {
      const result = await resendInvite(invite);
      if (result.alreadyExists) {
        setInviteInfo(`Inbjudan till ${invite.email} skickades inte om: användaren finns redan eller har redan en aktiv inbjudan.`);
        return;
      }
      setInviteInfo(`Inbjudan skickades om till ${invite.email}.`);
    } catch (error) {
      alert(error instanceof Error ? error.message : t('resources.user_action_failed'));
    }
  };

  const handleRevokeInvite = async (inviteId: string) => {
    try {
      await revokeInvite(inviteId);
      setInviteInfo('Inbjudan har återkallats.');
    } catch (error) {
      alert(error instanceof Error ? error.message : t('resources.user_action_failed'));
    }
  };

  const handleCsvUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      setCsvText(text);
      setSelectedImportFileName(file.name);
      setImportError(null);
      setImportResult(null);
    } catch {
      setImportError(t('resources.file_read_failed'));
    }
  };

  const triggerFileUpload = () => {
    csvFileInputRef.current?.click();
  };

  const downloadCsvTemplate = () => {
    const template = [
      CSV_IMPORT_HEADERS.join(','),
      'Klick AB,556677-8899,Storgatan 1 Stockholm,Anna Andersson,0701234567,anna@klick.se,Kaffemaskin A,WMF 1300 S,SN-12345,Reception',
    ].join('\n');

    const blob = new Blob([template], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'flowly-import-mall.csv';
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  };

  const openImportModal = () => {
    setIsImportOpen(true);
    setCsvText('');
    setImportResult(null);
    setImportError(null);
    setSelectedImportFileName('');
  };

  const closeImportModal = () => {
    setIsImportOpen(false);
    setImportError(null);
  };

  const runImport = async (dryRun: boolean) => {
    if (!hasCsvData) {
      setImportError(t('resources.no_csv_loaded'));
      return;
    }

    setIsImporting(true);
    setImportError(null);
    try {
      const parsed = parseCsvImport(csvText);

      if (parsed.missingRequiredHeaders.length > 0) {
        throw new Error(`${t('resources.missing_headers')}: ${parsed.missingRequiredHeaders.join(', ')}`);
      }
      if (parsed.rows.length === 0) {
        throw new Error(t('resources.no_rows'));
      }

      const rows = parsed.rows;
      const result = await importCustomersAssets(rows, dryRun);
      setImportResult(result);
    } catch (error) {
      setImportError(error instanceof Error ? error.message : t('resources.import_failed'));
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
            onClick={openImportModal}
            className="flex items-center gap-2 border border-gray-300 bg-white text-slate-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 transition"
          >
            <Upload className="w-4 h-4" />
            {t('resources.csv_import')}
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
                    <td className="px-6 py-4">{customers.find((customer) => customer.id === asset.customer_id)?.name || t('common.unknown')}</td>
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
            <>
              <div className="px-6 py-3 border-b border-gray-100 bg-slate-50 text-xs text-slate-600">
                Hantera teamet via inbjudningar: bjud in som administratör eller tekniker.
              </div>
              <table className="w-full text-left text-sm text-slate-600">
                <thead className="bg-gray-50 text-xs uppercase font-semibold text-slate-500">
                <tr>
                  <th className="px-6 py-4">{t('settings.table.user')}</th>
                  <th className="px-6 py-4">{t('common.email')}</th>
                  <th className="px-6 py-4">{t('settings.table.role')}</th>
                  <th className="px-6 py-4">{t('settings.table.status')}</th>
                  <th className="px-6 py-4 text-right">{t('table.actions')}</th>
                </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                {filteredTechs.map((member) => {
                  const hasPendingInvite = pendingInviteEmails.has(member.email.toLowerCase());
                  return (
                  <tr key={member.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center font-bold text-slate-600">
                            {member.full_name.charAt(0)}
                          </div>
                          <span className="font-medium text-slate-900">{member.full_name}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm">{member.email}</td>
                      <td className="px-6 py-4">
                        <span className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">
                          {member.role}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${
                            hasPendingInvite
                              ? 'bg-amber-100 text-amber-700'
                              : member.status === 'ACTIVE'
                              ? 'bg-emerald-100 text-emerald-700'
                              : 'bg-amber-100 text-amber-700'
                          }`}
                        >
                          {hasPendingInvite ? 'INVITED' : member.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <button
                          onClick={() => handleToggleRole(member.id, member.role === 'ADMIN')}
                          className="rounded border border-slate-200 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                        >
                          {member.role === 'ADMIN' ? t('resources.make_technician') : t('resources.make_admin')}
                        </button>
                      </td>
                    </tr>
                  );
                })}
                  {filteredTechs.length === 0 && (
                    <tr>
                      <td colSpan={5} className="p-8 text-center text-slate-400 italic">
                        {t('customers.no_customers')}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </>
          )}
        </div>

        {activeTab === 'techs' && pendingInvites.length > 0 && (
          <div className="mt-6 bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100">
              <h3 className="text-sm font-semibold text-slate-800">Pending invites</h3>
              {inviteInfo && (
                <p className="mt-2 text-xs text-amber-700">{inviteInfo}</p>
              )}
            </div>
            <table className="w-full text-left text-sm text-slate-600">
              <thead className="bg-gray-50 text-xs uppercase font-semibold text-slate-500">
                <tr>
                  <th className="px-6 py-4">{t('common.email')}</th>
                  <th className="px-6 py-4">{t('settings.table.role')}</th>
                  <th className="px-6 py-4">Expires</th>
                  <th className="px-6 py-4 text-right">{t('table.actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {pendingInvites.map((invite) => (
                  <tr key={invite.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4">{invite.email}</td>
                    <td className="px-6 py-4">{invite.role}</td>
                    <td className="px-6 py-4">{invite.expires_at ? new Date(invite.expires_at).toLocaleDateString() : '-'}</td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => handleResendInvite(invite)}
                          className="rounded border border-slate-200 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                        >
                          Resend
                        </button>
                        <button
                          onClick={() => handleRevokeInvite(invite.id)}
                          className="rounded border border-red-200 px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-50"
                        >
                          Revoke
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
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
                  <option value="">{t('resources.select_customer')}</option>
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
                  placeholder={t('resources.full_name')}
                />
              </div>
              <div>
                <label className="block text-sm font-semibold mb-1">{t('common.email')}</label>
                <input
                  type="email"
                  className="w-full p-2 border rounded-lg"
                  value={newTechEmail}
                  onChange={(event) => setNewTechEmail(event.target.value)}
                  required
                  placeholder={t('resources.email_placeholder')}
                />
              </div>
              <div>
                <label className="block text-sm font-semibold mb-1">{t('settings.table.role')}</label>
                <select
                  className="w-full p-2 border rounded-lg"
                  value={newTechRole}
                  onChange={(event) => setNewTechRole(event.target.value as UserRole)}
                >
                  <option value={UserRole.TECHNICIAN}>{t('settings.tech_role')}</option>
                  <option value={UserRole.ADMIN}>{t('settings.admin_role')}</option>
                </select>
              </div>
              <div className="flex justify-end gap-2 mt-6">
                <button type="button" onClick={() => setIsTechModalOpen(false)} className="px-4 py-2 border rounded-lg">
                  {t('common.cancel')}
                </button>
                <button type="submit" className="px-4 py-2 bg-docuraft-navy text-white rounded-lg">
                  {t('resources.invite')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {isImportOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl p-6">
            <h2 className="text-xl font-bold mb-3">{t('resources.csv_import')}</h2>
            <p className="text-sm text-slate-500">{t('resources.csv_expected_headers')}</p>
            <div className="mt-2 mb-2 flex flex-wrap gap-2">
              {CSV_IMPORT_HEADERS.map((header) => (
                <code key={header} className="rounded-md bg-slate-100 px-2 py-1 text-xs text-slate-700">
                  {header}
                </code>
              ))}
            </div>
            <p className="text-xs text-slate-500 mb-4">{t('resources.required_header_hint')}</p>

            <div className="mb-3 flex items-center gap-3">
              <input
                ref={csvFileInputRef}
                type="file"
                accept=".csv,text/csv"
                onChange={handleCsvUpload}
                className="sr-only"
              />
              <button
                type="button"
                onClick={triggerFileUpload}
                className="px-4 py-2 border rounded-lg bg-white text-slate-700 text-sm font-medium hover:bg-slate-50"
              >
                {t('resources.upload_csv')}
              </button>
              <button
                type="button"
                onClick={downloadCsvTemplate}
                className="px-4 py-2 border rounded-lg bg-white text-slate-700 text-sm font-medium hover:bg-slate-50"
              >
                {t('resources.download_template')}
              </button>
              <p className="text-sm text-slate-500 truncate">
                {selectedImportFileName ? (
                  <>
                    {t('resources.selected_file')}: <span className="font-medium text-slate-700">{selectedImportFileName}</span>
                  </>
                ) : (
                  t('resources.no_file_selected')
                )}
              </p>
            </div>
            <textarea
              value={csvText}
              onChange={(event) => {
                setCsvText(event.target.value);
                setImportError(null);
              }}
              className="w-full min-h-[180px] p-3 border rounded-lg text-sm"
              placeholder={t('resources.paste_csv')}
            />

            {importError && (
              <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                {importError}
              </div>
            )}

            {!importError && !hasCsvData && (
              <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                {t('resources.no_csv_loaded')}
              </div>
            )}

            {importResult && (
              <div className="mt-4 rounded-lg border border-slate-200 p-3 text-sm">
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                  <div>{t('resources.created')}: {importResult.created}</div>
                  <div>{t('resources.updated')}: {importResult.updated}</div>
                  <div>{t('resources.skipped')}: {importResult.skipped ?? 0}</div>
                  <div>{t('resources.failed')}: {importResult.failed.length}</div>
                  <div>{t('resources.rows_processed')}: {importResult.summary?.rows_processed ?? importResult.row_results?.length ?? 0}</div>
                  <div>{importResult.dry_run ? t('resources.import_mode_dry') : t('resources.import_mode_live')}</div>
                </div>

                <div className="mt-2 grid grid-cols-2 md:grid-cols-4 gap-2 text-xs text-slate-600">
                  <div>{t('resources.customers_created')}: {importResult.summary?.customers_created ?? 0}</div>
                  <div>{t('resources.customers_updated')}: {importResult.summary?.customers_updated ?? 0}</div>
                  <div>{t('resources.assets_created')}: {importResult.summary?.assets_created ?? 0}</div>
                  <div>{t('resources.assets_updated')}: {importResult.summary?.assets_updated ?? 0}</div>
                </div>

                {(importResult.row_results?.length ?? 0) > 0 && (
                  <div className="mt-4">
                    <h3 className="font-semibold text-slate-700 mb-2">{t('resources.results_per_row')}</h3>
                    <div className="max-h-48 overflow-auto rounded border border-slate-200">
                      <table className="w-full text-xs">
                        <thead className="bg-slate-50 text-slate-500 uppercase">
                          <tr>
                            <th className="px-2 py-2 text-left">{t('resources.row')}</th>
                            <th className="px-2 py-2 text-left">{t('resources.action')}</th>
                            <th className="px-2 py-2 text-left">{t('resources.message')}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(importResult.row_results ?? []).map((resultRow) => (
                            <tr key={`${resultRow.row}-${resultRow.action}`} className="border-t border-slate-100">
                              <td className="px-2 py-2">{resultRow.row}</td>
                              <td className="px-2 py-2">
                                <span
                                  className={`inline-flex rounded-full px-2 py-0.5 font-semibold ${
                                    resultRow.action === 'created'
                                      ? 'bg-emerald-50 text-emerald-700'
                                      : resultRow.action === 'updated'
                                        ? 'bg-blue-50 text-blue-700'
                                        : resultRow.action === 'skipped'
                                          ? 'bg-slate-100 text-slate-700'
                                          : 'bg-red-50 text-red-700'
                                  }`}
                                >
                                  {resultRow.action === 'created'
                                    ? t('resources.status_created')
                                    : resultRow.action === 'updated'
                                      ? t('resources.status_updated')
                                      : resultRow.action === 'skipped'
                                        ? t('resources.status_skipped')
                                        : t('resources.status_failed')}
                                </span>
                              </td>
                              <td className="px-2 py-2 text-slate-700">{resultRow.message}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {importResult.failed.length > 0 && (
                  <ul className="mt-3 max-h-24 overflow-auto text-xs text-red-600">
                    {importResult.failed.map((failure, idx) => (
                      <li key={idx}>
                        {t('resources.row')} {failure.row}: {failure.error}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            <div className="mt-4 flex justify-between items-center gap-2">
              <button onClick={closeImportModal} className="px-4 py-2 border rounded-lg">
                {t('common.close')}
              </button>
              <div className="flex gap-2">
                <button
                  onClick={() => runImport(true)}
                  disabled={isImporting || !hasCsvData}
                  className="px-4 py-2 border rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isImporting ? t('resources.running') : t('resources.run_dry')}
                </button>
                <button
                  onClick={() => runImport(false)}
                  disabled={isImporting || !hasCsvData}
                  className="px-4 py-2 bg-docuraft-navy text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isImporting ? t('resources.importing') : t('resources.import')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
