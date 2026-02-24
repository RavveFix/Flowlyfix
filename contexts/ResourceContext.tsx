import React, { createContext, useContext, useEffect, useMemo, useState, ReactNode } from 'react';
import {
  Asset,
  CsvImportResult,
  CsvImportRow,
  Customer,
  InventoryItem,
  Profile,
  TechnicianProfile,
  UserRole,
} from '../types';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { useAuth } from './AuthContext';

interface InviteTechnicianInput {
  email: string;
  full_name: string;
  role?: UserRole;
}

interface ResourceContextType {
  customers: Customer[];
  assets: Asset[];
  technicians: TechnicianProfile[];
  inventoryItems: InventoryItem[];
  loading: boolean;
  addCustomer: (customer: Partial<Customer>) => Promise<Customer | null>;
  updateCustomer: (id: string, updates: Partial<Customer>) => Promise<void>;
  deleteCustomer: (id: string) => Promise<void>;
  addAsset: (asset: Partial<Asset>) => Promise<Asset | null>;
  updateAsset: (id: string, updates: Partial<Asset>) => Promise<void>;
  deleteAsset: (id: string) => Promise<void>;
  addTechnician: (tech: { id?: string; name?: string }) => Promise<void>;
  deleteTechnician: (id: string) => Promise<void>;
  inviteTechnician: (input: InviteTechnicianInput) => Promise<{ invited_user_id: string; invite_sent: boolean }>;
  importCustomersAssets: (rows: CsvImportRow[], dryRun?: boolean) => Promise<CsvImportResult>;
  getAssetName: (id?: string | null) => string;
  getCustomerName: (id?: string | null) => string;
  getAssetById: (id?: string | null) => Asset | undefined;
  getCustomerById: (id?: string | null) => Customer | undefined;
  getTechnicianById: (id?: string | null) => TechnicianProfile | undefined;
  reload: () => Promise<void>;
}

const ResourceContext = createContext<ResourceContextType | undefined>(undefined);

const DEMO_CUSTOMERS: Customer[] = [
  {
    id: 'demo-customer-1',
    organization_id: 'demo-org',
    name: 'Nordic Coffee House',
    org_number: '556677-1234',
    external_fortnox_id: null,
    address: 'Kungsgatan 1, Stockholm',
    contact_person: 'Anna Berg',
    contact_phone: '+46 70 111 22 33',
    contact_email: 'anna@nordiccoffee.se',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'demo-customer-2',
    organization_id: 'demo-org',
    name: 'City Office AB',
    org_number: '556812-9981',
    external_fortnox_id: null,
    address: 'Drottninggatan 14, Göteborg',
    contact_person: 'Martin Ek',
    contact_phone: '+46 70 222 33 44',
    contact_email: 'martin@cityoffice.se',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
];

const DEMO_ASSETS: Asset[] = [
  {
    id: 'demo-asset-1',
    organization_id: 'demo-org',
    customer_id: 'demo-customer-1',
    customer_site_id: null,
    name: 'Barista Pro #1',
    model: 'Barista Pro 9000',
    serial_number: 'BP9K-001',
    qr_code_id: null,
    location_in_building: 'Entréplan',
    install_date: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'demo-asset-2',
    organization_id: 'demo-org',
    customer_id: 'demo-customer-2',
    customer_site_id: null,
    name: 'Office Brew #3',
    model: 'Office Brew X',
    serial_number: 'OBX-778',
    qr_code_id: null,
    location_in_building: 'Plan 4, pentry',
    install_date: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
];

const DEMO_TECHNICIANS: TechnicianProfile[] = [
  {
    id: 'demo-tech-1',
    organization_id: 'demo-org',
    email: 'sarah@flowly.io',
    full_name: 'Sarah Connor',
    role: UserRole.TECHNICIAN,
    avatar_url: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'demo-tech-2',
    organization_id: 'demo-org',
    email: 'kyle@flowly.io',
    full_name: 'Kyle Reese',
    role: UserRole.TECHNICIAN,
    avatar_url: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
];

export const ResourceProvider = ({ children }: { children?: ReactNode }) => {
  const { profile, loading: authLoading } = useAuth();
  const [loading, setLoading] = useState(true);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [technicians, setTechnicians] = useState<TechnicianProfile[]>([]);
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);

  const organizationId = profile?.organization_id ?? null;

  const loadResources = async () => {
    if (authLoading) return;

    if (!organizationId || !supabase || !isSupabaseConfigured) {
      setCustomers(DEMO_CUSTOMERS);
      setAssets(DEMO_ASSETS);
      setTechnicians(DEMO_TECHNICIANS);
      setInventoryItems([]);
      setLoading(false);
      return;
    }

    setLoading(true);

    const [customersRes, assetsRes, techsRes, inventoryRes] = await Promise.all([
      supabase.from('customers').select('*').eq('organization_id', organizationId).order('name'),
      supabase.from('assets').select('*').eq('organization_id', organizationId).order('created_at', { ascending: false }),
      supabase
        .from('profiles')
        .select('*')
        .eq('organization_id', organizationId)
        .eq('role', UserRole.TECHNICIAN)
        .order('full_name'),
      supabase.from('inventory_items').select('*').eq('organization_id', organizationId).order('name'),
    ]);

    if (customersRes.error) console.error('customers load failed:', customersRes.error.message);
    if (assetsRes.error) console.error('assets load failed:', assetsRes.error.message);
    if (techsRes.error) console.error('technicians load failed:', techsRes.error.message);
    if (inventoryRes.error) console.error('inventory load failed:', inventoryRes.error.message);

    setCustomers((customersRes.data as Customer[]) ?? []);
    setAssets((assetsRes.data as Asset[]) ?? []);
    setTechnicians(((techsRes.data as Profile[]) ?? []).map((profileRow) => ({
      ...profileRow,
      role: UserRole.TECHNICIAN,
    })));
    setInventoryItems((inventoryRes.data as InventoryItem[]) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    loadResources().catch((error) => {
      console.error('loadResources failed:', error);
      setLoading(false);
    });
  }, [organizationId, authLoading]);

  useEffect(() => {
    if (!supabase || !organizationId) {
      return;
    }

    const channel = supabase
      .channel(`resources-${organizationId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'customers', filter: `organization_id=eq.${organizationId}` },
        () => {
          loadResources().catch((error) => console.error('customer realtime load failed:', error));
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'assets', filter: `organization_id=eq.${organizationId}` },
        () => {
          loadResources().catch((error) => console.error('asset realtime load failed:', error));
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'profiles', filter: `organization_id=eq.${organizationId}` },
        () => {
          loadResources().catch((error) => console.error('profile realtime load failed:', error));
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [organizationId]);

  const addCustomer = async (customer: Partial<Customer>) => {
    const fallback: Customer = {
      id: crypto.randomUUID(),
      organization_id: organizationId ?? 'demo-org',
      name: customer.name ?? 'Unnamed customer',
      org_number: customer.org_number ?? null,
      external_fortnox_id: customer.external_fortnox_id ?? null,
      address: customer.address ?? '',
      contact_person: customer.contact_person ?? null,
      contact_phone: customer.contact_phone ?? null,
      contact_email: customer.contact_email ?? null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    if (!supabase || !organizationId) {
      setCustomers((prev) => [fallback, ...prev]);
      return fallback;
    }

    const { data, error } = await supabase
      .from('customers')
      .insert({
        organization_id: organizationId,
        name: fallback.name,
        org_number: fallback.org_number,
        external_fortnox_id: fallback.external_fortnox_id,
        address: fallback.address,
        contact_person: fallback.contact_person,
        contact_phone: fallback.contact_phone,
        contact_email: fallback.contact_email,
      })
      .select('*')
      .single();

    if (error) {
      console.error('addCustomer failed:', error.message);
      return null;
    }

    const created = data as Customer;
    setCustomers((prev) => [created, ...prev]);
    return created;
  };

  const updateCustomer = async (id: string, updates: Partial<Customer>) => {
    if (!supabase || !organizationId) {
      setCustomers((prev) => prev.map((customer) => (customer.id === id ? { ...customer, ...updates } : customer)));
      return;
    }

    const { error } = await supabase
      .from('customers')
      .update(updates)
      .eq('id', id)
      .eq('organization_id', organizationId);

    if (error) {
      console.error('updateCustomer failed:', error.message);
      return;
    }

    setCustomers((prev) => prev.map((customer) => (customer.id === id ? { ...customer, ...updates } : customer)));
  };

  const deleteCustomer = async (id: string) => {
    if (!supabase || !organizationId) {
      setCustomers((prev) => prev.filter((customer) => customer.id !== id));
      return;
    }

    const { error } = await supabase.from('customers').delete().eq('id', id).eq('organization_id', organizationId);
    if (error) {
      console.error('deleteCustomer failed:', error.message);
      return;
    }

    setCustomers((prev) => prev.filter((customer) => customer.id !== id));
  };

  const addAsset = async (asset: Partial<Asset>) => {
    const fallback: Asset = {
      id: crypto.randomUUID(),
      organization_id: organizationId ?? 'demo-org',
      customer_id: asset.customer_id ?? customers[0]?.id ?? '',
      customer_site_id: asset.customer_site_id ?? null,
      name: asset.name ?? asset.model ?? 'Unnamed asset',
      model: asset.model ?? 'Unknown model',
      serial_number: asset.serial_number ?? `SN-${Date.now()}`,
      qr_code_id: asset.qr_code_id ?? null,
      location_in_building: asset.location_in_building ?? null,
      install_date: asset.install_date ?? null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    if (!supabase || !organizationId) {
      setAssets((prev) => [fallback, ...prev]);
      return fallback;
    }

    const { data, error } = await supabase
      .from('assets')
      .insert({
        organization_id: organizationId,
        customer_id: fallback.customer_id,
        customer_site_id: fallback.customer_site_id,
        name: fallback.name,
        model: fallback.model,
        serial_number: fallback.serial_number,
        qr_code_id: fallback.qr_code_id,
        location_in_building: fallback.location_in_building,
        install_date: fallback.install_date,
      })
      .select('*')
      .single();

    if (error) {
      console.error('addAsset failed:', error.message);
      return null;
    }

    const created = data as Asset;
    setAssets((prev) => [created, ...prev]);
    return created;
  };

  const updateAsset = async (id: string, updates: Partial<Asset>) => {
    if (!supabase || !organizationId) {
      setAssets((prev) => prev.map((asset) => (asset.id === id ? { ...asset, ...updates } : asset)));
      return;
    }

    const { error } = await supabase.from('assets').update(updates).eq('id', id).eq('organization_id', organizationId);
    if (error) {
      console.error('updateAsset failed:', error.message);
      return;
    }

    setAssets((prev) => prev.map((asset) => (asset.id === id ? { ...asset, ...updates } : asset)));
  };

  const deleteAsset = async (id: string) => {
    if (!supabase || !organizationId) {
      setAssets((prev) => prev.filter((asset) => asset.id !== id));
      return;
    }

    const { error } = await supabase.from('assets').delete().eq('id', id).eq('organization_id', organizationId);
    if (error) {
      console.error('deleteAsset failed:', error.message);
      return;
    }

    setAssets((prev) => prev.filter((asset) => asset.id !== id));
  };

  const addTechnician = async (tech: { id?: string; name?: string }) => {
    if (!supabase || !organizationId) {
      const displayName = tech.name?.trim() || 'New Technician';
      setTechnicians((prev) => [
        {
          id: tech.id ?? crypto.randomUUID(),
          organization_id: organizationId ?? 'demo-org',
          email: `${displayName.toLowerCase().replace(/\s+/g, '.')}@flowly.local`,
          full_name: displayName,
          role: UserRole.TECHNICIAN,
          avatar_url: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        ...prev,
      ]);
      return;
    }

    throw new Error('Use inviteTechnician for Supabase-backed environments.');
  };

  const deleteTechnician = async (id: string) => {
    if (!supabase || !organizationId) {
      setTechnicians((prev) => prev.filter((tech) => tech.id !== id));
      return;
    }

    const { error } = await supabase.from('profiles').delete().eq('id', id).eq('organization_id', organizationId);
    if (error) {
      console.error('deleteTechnician failed:', error.message);
      return;
    }

    setTechnicians((prev) => prev.filter((tech) => tech.id !== id));
  };

  const inviteTechnician = async (input: InviteTechnicianInput) => {
    if (!supabase) {
      const fakeId = crypto.randomUUID();
      const technician: TechnicianProfile = {
        id: fakeId,
        organization_id: organizationId ?? 'demo-org',
        email: input.email,
        full_name: input.full_name,
        role: UserRole.TECHNICIAN,
        avatar_url: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      setTechnicians((prev) => [technician, ...prev]);
      return { invited_user_id: fakeId, invite_sent: true };
    }

    const { data, error } = await supabase.functions.invoke('invite-technician', {
      body: {
        email: input.email,
        full_name: input.full_name,
        role: input.role ?? UserRole.TECHNICIAN,
      },
    });

    if (error) {
      throw new Error(error.message);
    }

    await loadResources();
    return data as { invited_user_id: string; invite_sent: boolean };
  };

  const importCustomersAssets = async (rows: CsvImportRow[], dryRun = false): Promise<CsvImportResult> => {
    if (!supabase) {
      return {
        created: rows.length,
        updated: 0,
        failed: [],
      };
    }

    const { data, error } = await supabase.functions.invoke('import-customers-assets', {
      body: {
        rows,
        dry_run: dryRun,
      },
    });

    if (error) {
      throw new Error(error.message);
    }

    if (!dryRun) {
      await loadResources();
    }

    return data as CsvImportResult;
  };

  const getAssetById = (id?: string | null) => {
    if (!id) return undefined;
    return assets.find((asset) => asset.id === id);
  };

  const getCustomerById = (id?: string | null) => {
    if (!id) return undefined;
    return customers.find((customer) => customer.id === id);
  };

  const getTechnicianById = (id?: string | null) => {
    if (!id) return undefined;
    return technicians.find((technician) => technician.id === id);
  };

  const getAssetName = (id?: string | null) => {
    const asset = getAssetById(id);
    return asset ? `${asset.model} (${asset.serial_number})` : 'Unknown Asset';
  };

  const getCustomerName = (id?: string | null) => {
    const customer = getCustomerById(id);
    return customer ? customer.name : 'Unknown Customer';
  };

  const value = useMemo<ResourceContextType>(
    () => ({
      customers,
      assets,
      technicians,
      inventoryItems,
      loading,
      addCustomer,
      updateCustomer,
      deleteCustomer,
      addAsset,
      updateAsset,
      deleteAsset,
      addTechnician,
      deleteTechnician,
      inviteTechnician,
      importCustomersAssets,
      getAssetName,
      getCustomerName,
      getAssetById,
      getCustomerById,
      getTechnicianById,
      reload: loadResources,
    }),
    [customers, assets, technicians, inventoryItems, loading, organizationId],
  );

  return <ResourceContext.Provider value={value}>{children}</ResourceContext.Provider>;
};

export const useResources = () => {
  const context = useContext(ResourceContext);
  if (!context) {
    throw new Error('useResources must be used within a ResourceProvider');
  }
  return context;
};
