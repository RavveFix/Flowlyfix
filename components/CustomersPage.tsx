import React, { useState } from 'react';
import { Search, Plus, RefreshCw, MoreHorizontal, Mail, MapPin, Link as LinkIcon, X, Building, User, Phone, Trash2 } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import { useResources } from '../contexts/ResourceContext';
import { syncCustomersMock } from '../services/fortnoxIntegration';
import { Button } from './ui/button';
import { Input } from './ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from './ui/table';

export const CustomersPage: React.FC = () => {
  const { t } = useLanguage();
  const { customers, addCustomer, deleteCustomer } = useResources();
  const [isSyncing, setIsSyncing] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  
  // State for Add Modal
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newCustomer, setNewCustomer] = useState({
      name: '',
      contact_person: '',
      contact_phone: '',
      address: ''
  });

  const handleSync = async () => {
    setIsSyncing(true);
    
    // Simulate network delay for better UX
    await new Promise(resolve => setTimeout(resolve, 1500));

    try {
        const newFortnoxCustomers = await syncCustomersMock();
        
        newFortnoxCustomers.forEach(fc => {
            const existingIndex = customers.findIndex(c => c.name === fc.name);
            
            if (existingIndex === -1) {
                addCustomer({
                    id: `c-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
                    name: fc.name,
                    address: '1007 Mountain Drive, Gotham', 
                    contact_person: 'Lucius Fox', 
                    external_fortnox_id: fc.external_id
                });
            }
            // Note: Update existing logic omitted for brevity in this context switch, focus is on Add/Delete
        });
    } catch (error) {
        console.error("Failed to sync customers:", error);
    } finally {
        setIsSyncing(false);
    }
  };

  const handleAddCustomer = async (e: React.FormEvent) => {
      e.preventDefault();
      await addCustomer({
          name: newCustomer.name,
          contact_person: newCustomer.contact_person,
          contact_phone: newCustomer.contact_phone,
          address: newCustomer.address
      });
      setIsAddModalOpen(false);
      setNewCustomer({ name: '', contact_person: '', contact_phone: '', address: '' });
  };

  const filteredCustomers = customers.filter(c => 
    c.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    c.contact_person?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="flex-1 bg-slate-50 min-h-full font-sans relative">
        {/* Header */}
      <div className="bg-white border-b border-gray-200 px-8 py-5 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{t('customers.title')}</h1>
          <p className="text-slate-500 text-sm mt-1">{t('customers.subtitle')}</p>
        </div>
        <div className="flex items-center gap-3">
             <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 z-10" />
                <Input 
                  type="text" 
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder={t('customers.search_placeholder')}
                  className="pl-10 pr-4 bg-white border-gray-200 rounded-lg text-sm focus-visible:ring-docuraft-navy/20 w-64 h-10"
                />
            </div>
            <Button 
                onClick={() => setIsAddModalOpen(true)}
                className="flex items-center gap-2 bg-docuraft-navy text-white px-4 rounded-lg text-sm font-medium hover:bg-slate-800 transition h-10"
            >
                <Plus className="w-4 h-4" />
                {t('customers.add_new')}
            </Button>
        </div>
      </div>

      {/* Table */}
      <div className="p-8">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <Table>
              <TableHeader className="bg-gray-50 uppercase text-slate-500">
                <TableRow>
                  <TableHead className="font-semibold">{t('customers.table.name')}</TableHead>
                  <TableHead className="font-semibold">{t('customers.table.contact')}</TableHead>
                  <TableHead className="text-right font-semibold">{t('table.actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredCustomers.map((customer) => (
                    <TableRow key={customer.id} className="hover:bg-gray-50 transition-colors group">
                        <TableCell>
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold">
                                    {customer.name.substring(0,2).toUpperCase()}
                                </div>
                                <div>
                                    <div className="font-medium text-slate-900">{customer.name}</div>
                                    <div className="text-xs text-slate-400">{t('customers.id_label')} {customer.id}</div>
                                </div>
                            </div>
                        </TableCell>
                        <TableCell>
                            <div className="flex flex-col gap-1">
                                <span className="font-medium text-slate-800">{customer.contact_person || '-'}</span>
                                <div className="flex items-center gap-2 text-xs text-slate-400">
                                    <Mail className="w-3 h-3" />
                                    <span>contact@{customer.name.toLowerCase().replace(/\s/g, '').replace(/[^a-z0-9]/g, '')}.com</span>
                                </div>
                            </div>
                        </TableCell>
                        <TableCell>
                             <div className="flex items-center gap-2 text-slate-500">
                                <MapPin className="w-4 h-4 text-gray-400" />
                                {customer.address}
                             </div>
                        </TableCell>
                        <TableCell className="text-right">
                            <div className="flex justify-end gap-2">
                                <Button variant="ghost" size="icon" onClick={() => deleteCustomer(customer.id)} className="text-slate-400 hover:text-red-500 hover:bg-red-50">
                                    <Trash2 className="w-5 h-5" />
                                </Button>
                            </div>
                        </TableCell>
                    </TableRow>
                ))}
              </TableBody>
            </Table>
            {filteredCustomers.length === 0 && (
                <div className="p-12 text-center text-slate-500">
                    {t('customers.no_customers')}
                </div>
            )}
        </div>
      </div>

      {/* Add Customer Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                <div className="px-6 py-5 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                    <h2 className="text-lg font-bold text-slate-900">{t('customers.add_new')}</h2>
                    <button onClick={() => setIsAddModalOpen(false)} className="text-slate-400 hover:text-slate-600 transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                </div>
                
                <form onSubmit={handleAddCustomer} className="p-6 space-y-4">
                    <div>
                        <label className="block text-sm font-semibold text-slate-700 mb-2 flex items-center gap-2">
                            <Building className="w-4 h-4 text-slate-400" /> {t('customers.table.name')}
                        </label>
                        <Input 
                            required
                            type="text" 
                            value={newCustomer.name}
                            onChange={(e) => setNewCustomer({...newCustomer, name: e.target.value})}
                            className="w-full bg-white transition-all rounded-lg focus-visible:ring-docuraft-navy/20 h-10"
                            placeholder="T.ex. Acme Corp"
                        />
                    </div>
                    
                    <div>
                        <label className="block text-sm font-semibold text-slate-700 mb-2 flex items-center gap-2">
                            <User className="w-4 h-4 text-slate-400" /> {t('customers.table.contact')}
                        </label>
                        <Input 
                            required
                            type="text" 
                            value={newCustomer.contact_person}
                            onChange={(e) => setNewCustomer({...newCustomer, contact_person: e.target.value})}
                            className="w-full bg-white transition-all rounded-lg focus-visible:ring-docuraft-navy/20 h-10"
                            placeholder="För- och efternamn"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-semibold text-slate-700 mb-2 flex items-center gap-2">
                            <Phone className="w-4 h-4 text-slate-400" /> Telefon
                        </label>
                        <Input 
                            type="tel" 
                            value={newCustomer.contact_phone}
                            onChange={(e) => setNewCustomer({...newCustomer, contact_phone: e.target.value})}
                            className="w-full bg-white transition-all rounded-lg focus-visible:ring-docuraft-navy/20 h-10"
                            placeholder="+46..."
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-semibold text-slate-700 mb-2 flex items-center gap-2">
                            <MapPin className="w-4 h-4 text-slate-400" /> {t('customers.table.address')}
                        </label>
                        <Input 
                            required
                            type="text" 
                            value={newCustomer.address}
                            onChange={(e) => setNewCustomer({...newCustomer, address: e.target.value})}
                            className="w-full bg-white transition-all rounded-lg focus-visible:ring-docuraft-navy/20 h-10"
                            placeholder="Gatuadress, Postnummer Ort"
                        />
                    </div>

                    <div className="pt-4 flex gap-3">
                        <Button 
                            type="button" 
                            variant="outline"
                            onClick={() => setIsAddModalOpen(false)}
                            className="flex-1 rounded-lg text-slate-700"
                        >
                            {t('common.cancel')}
                        </Button>
                        <Button 
                            type="submit"
                            className="flex-1 bg-docuraft-navy hover:bg-slate-800 text-white rounded-lg shadow-sm"
                        >
                            {t('common.save')}
                        </Button>
                    </div>
                </form>
            </div>
        </div>
      )}
    </div>
  );
};
