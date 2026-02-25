import React, { createContext, useContext, useEffect, useMemo, useState, ReactNode } from 'react';
import {
  Asset,
  CsvImportResult,
  CsvImportRow,
  Customer,
  InventoryItem,
  OrganizationInvite,
  Profile,
  TechnicianProfile,
  UserRole,
  UserStatus,
} from '@/shared/types';
import { supabase, isSupabaseConfigured, runtimeAuthMode } from '@/shared/lib/supabase/client';
import { useAuth } from '@/features/auth/state/AuthContext';
import {
  addAssetRow,
  InviteFunctionErrorCode,
  InviteFunctionResponse,
  ManageUserRoleErrorCode,
  changeUserRoleRow,
  addCustomerRow,
  deleteAssetRow,
  deleteCustomerRow,
  fetchResourcesByOrganization,
  importCustomersAssetsFn,
  inviteTechnicianFn,
  listPendingInvitesFn,
  subscribeToResourceChanges,
  updateAssetRow,
  updateCustomerRow,
} from '@/features/resources/api/resourcesRepo';

interface InviteTechnicianInput {
  email: string;
  full_name: string;
  role?: UserRole;
}

interface ResendInviteResult {
  resent: boolean;
  alreadyExists?: boolean;
}

function mapInviteError(code: InviteFunctionErrorCode | string | undefined, message: string) {
  switch (code) {
    case 'SESSION_INVALID':
      return 'Sessionen har löpt ut. Logga in igen och försök på nytt.';
    case 'INVITE_DUPLICATE':
      return 'En aktiv inbjudan finns redan för denna e-post i organisationen.';
    case 'MEMBERSHIP_NOT_ACTIVE':
      return 'Användaren saknar aktivt medlemskap i vald organisation. Försök igen eller kontakta admin.';
    case 'ORG_ROLE_MISMATCH':
      return 'Rollen blev inkonsekvent efter inbjudan. Försök igen eller kontakta admin.';
    case 'INVITE_REDIRECT_MISSING':
      return 'Miljöfel: INVITE_REDIRECT_URL saknas.';
    default:
      return message || 'Kunde inte hantera inbjudan just nu.';
  }
}

function mapRoleChangeError(code: ManageUserRoleErrorCode | string | undefined, message: string) {
  switch (code) {
    case 'UNAUTHORIZED':
      return 'Du saknar behörighet för att ändra roller i detta företag.';
    case 'ORG_SCOPE_MISMATCH':
      return 'Organisationen i förfrågan matchar inte din aktiva organisation.';
    case 'MEMBERSHIP_NOT_FOUND':
      return 'Användaren har inget medlemskap i den aktiva organisationen.';
    case 'MEMBERSHIP_NOT_ACTIVE':
      return 'Användaren måste ha ett aktivt medlemskap för att rollen ska kunna ändras.';
    case 'LAST_ACTIVE_ADMIN':
      return 'Kan inte ta bort admin-roll från sista aktiva admin i organisationen.';
    case 'INVALID_INPUT':
      return 'Ogiltig indata för rolländring.';
    default:
      return message || 'Kunde inte uppdatera användarrollen.';
  }
}

interface ResourceContextType {
  customers: Customer[];
  assets: Asset[];
  technicians: TechnicianProfile[];
  teamMembers: Profile[];
  inventoryItems: InventoryItem[];
  pendingInvites: OrganizationInvite[];
  loading: boolean;
  addCustomer: (customer: Partial<Customer>) => Promise<Customer | null>;
  updateCustomer: (id: string, updates: Partial<Customer>) => Promise<void>;
  deleteCustomer: (id: string) => Promise<void>;
  addAsset: (asset: Partial<Asset>) => Promise<Asset | null>;
  updateAsset: (id: string, updates: Partial<Asset>) => Promise<void>;
  deleteAsset: (id: string) => Promise<void>;
  addTechnician: (tech: { id?: string; name?: string }) => Promise<void>;
  inviteTechnician: (input: InviteTechnicianInput) => Promise<{ invited_user_id: string; invite_sent: boolean }>;
  changeUserRole: (id: string, role: UserRole) => Promise<void>;
  revokeInvite: (inviteId: string) => Promise<void>;
  resendInvite: (invite: OrganizationInvite) => Promise<ResendInviteResult>;
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

const DEMO_TEAM_MEMBERS: Profile[] = [
  {
    id: 'demo-admin-1',
    organization_id: 'demo-org',
    email: 'admin@flowly.io',
    full_name: 'Flowlyfix Admin',
    role: UserRole.ADMIN,
    status: UserStatus.ACTIVE,
    avatar_url: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'demo-tech-1',
    organization_id: 'demo-org',
    email: 'sarah@flowly.io',
    full_name: 'Sarah Connor',
    role: UserRole.TECHNICIAN,
    status: UserStatus.ACTIVE,
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
    status: UserStatus.ACTIVE,
    avatar_url: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
];

function deriveTechnicians(users: Profile[]): TechnicianProfile[] {
  return users
    .filter((member): member is TechnicianProfile => member.role === UserRole.TECHNICIAN && member.status === UserStatus.ACTIVE)
    .map((member) => ({
      ...member,
      role: UserRole.TECHNICIAN,
    }));
}

export const ResourceProvider = ({ children }: { children?: ReactNode }) => {
  const { session, activeRole, activeOrganizationId, loading: authLoading, authState, refreshProfile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [teamMembers, setTeamMembers] = useState<Profile[]>([]);
  const [technicians, setTechnicians] = useState<TechnicianProfile[]>([]);
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);
  const [pendingInvites, setPendingInvites] = useState<OrganizationInvite[]>([]);
  const pendingInvitesUnauthorizedRef = React.useRef(false);
  const hasSession = Boolean(session?.access_token);
  const isAuthenticated = authState === 'authenticated' && hasSession;

  const organizationId = activeOrganizationId ?? null;

  const refreshUsersFromList = (members: Profile[]) => {
    setTeamMembers(members);
    setTechnicians(deriveTechnicians(members));
  };

  const refreshInviteAndMembershipState = async () => {
    await loadResources();
  };

  const loadResources = async () => {
    if (authLoading || authState === 'bootstrapping') {
      setLoading(true);
      return;
    }

    if (runtimeAuthMode === 'demo') {
      setCustomers(DEMO_CUSTOMERS);
      setAssets(DEMO_ASSETS);
      refreshUsersFromList(DEMO_TEAM_MEMBERS);
      setInventoryItems([]);
      setPendingInvites([]);
      setLoading(false);
      return;
    }

    if (!isAuthenticated) {
      setCustomers([]);
      setAssets([]);
      refreshUsersFromList([]);
      setInventoryItems([]);
      setPendingInvites([]);
      setLoading(false);
      return;
    }

    if (!supabase || !isSupabaseConfigured || !organizationId) {
      setCustomers([]);
      setAssets([]);
      refreshUsersFromList([]);
      setInventoryItems([]);
      setPendingInvites([]);
      setLoading(false);
      return;
    }

    setLoading(true);

    const { customersRes, assetsRes, techsRes, inventoryRes } = await fetchResourcesByOrganization(organizationId);

    if (customersRes.error) console.error('customers load failed:', customersRes.error.message);
    if (assetsRes.error) console.error('assets load failed:', assetsRes.error.message);
    if (techsRes.error) console.error('profiles load failed:', techsRes.error.message);
    if (inventoryRes.error) console.error('inventory load failed:', inventoryRes.error.message);

    setCustomers((customersRes.data as Customer[]) ?? []);
    setAssets((assetsRes.data as Asset[]) ?? []);
    refreshUsersFromList((techsRes.data as Profile[]) ?? []);
    setInventoryItems((inventoryRes.data as InventoryItem[]) ?? []);
    const canReadInvites = activeRole === UserRole.ADMIN && isAuthenticated && !pendingInvitesUnauthorizedRef.current;
    if (canReadInvites) {
      try {
        const invites = await listPendingInvitesFn(organizationId);
        pendingInvitesUnauthorizedRef.current = false;
        setPendingInvites(invites);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (/unauthorized|session expired|invalid jwt|jwt|401/i.test(message)) {
          pendingInvitesUnauthorizedRef.current = true;
        } else {
          console.error('pending invites load failed:', error);
        }
        setPendingInvites([]);
      }
    } else {
      setPendingInvites([]);
    }
    setLoading(false);
  };

  useEffect(() => {
    pendingInvitesUnauthorizedRef.current = false;
  }, [organizationId]);

  useEffect(() => {
    loadResources().catch((error) => {
      console.error('loadResources failed:', error);
      setLoading(false);
    });
  }, [organizationId, authLoading, activeRole, hasSession, isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated || !supabase || !organizationId) {
      return;
    }

    return subscribeToResourceChanges(organizationId, () => {
      loadResources().catch((error) => console.error('resource realtime load failed:', error));
    });
  }, [organizationId, isAuthenticated]);

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

    const { data, error } = await addCustomerRow(organizationId, {
      name: fallback.name,
      org_number: fallback.org_number,
      external_fortnox_id: fallback.external_fortnox_id,
      address: fallback.address,
      contact_person: fallback.contact_person,
      contact_phone: fallback.contact_phone,
      contact_email: fallback.contact_email,
    });

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

    const { error } = await updateCustomerRow(organizationId, id, updates);

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

    const { error } = await deleteCustomerRow(organizationId, id);
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
      model: asset.model ?? 'N/A',
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

    const { data, error } = await addAssetRow(organizationId, {
      customer_id: fallback.customer_id,
      customer_site_id: fallback.customer_site_id,
      name: fallback.name,
      model: fallback.model,
      serial_number: fallback.serial_number,
      qr_code_id: fallback.qr_code_id,
      location_in_building: fallback.location_in_building,
      install_date: fallback.install_date,
    });

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

    const { error } = await updateAssetRow(organizationId, id, updates);
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

    const { error } = await deleteAssetRow(organizationId, id);
    if (error) {
      console.error('deleteAsset failed:', error.message);
      return;
    }

    setAssets((prev) => prev.filter((asset) => asset.id !== id));
  };

  const addTechnician = async (tech: { id?: string; name?: string }) => {
    if (!supabase || !organizationId) {
      const displayName = tech.name?.trim() || 'New Technician';
      const member: Profile = {
        id: tech.id ?? crypto.randomUUID(),
        organization_id: organizationId ?? 'demo-org',
        email: `${displayName.toLowerCase().replace(/\s+/g, '.')}@flowly.local`,
        full_name: displayName,
        role: UserRole.TECHNICIAN,
        status: UserStatus.ACTIVE,
        avatar_url: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      refreshUsersFromList([member, ...teamMembers]);
      return;
    }

    throw new Error('Use inviteTechnician for Supabase-backed environments.');
  };

  const inviteTechnician = async (input: InviteTechnicianInput) => {
    if (!supabase) {
      const fakeId = crypto.randomUUID();
      const member: Profile = {
        id: fakeId,
        organization_id: organizationId ?? 'demo-org',
        email: input.email,
        full_name: input.full_name,
        role: input.role ?? UserRole.TECHNICIAN,
        status: UserStatus.ACTIVE,
        avatar_url: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      refreshUsersFromList([member, ...teamMembers]);
      return { invited_user_id: fakeId, invite_sent: true };
    }

    const { data, error } = await inviteTechnicianFn({
      email: input.email,
      full_name: input.full_name,
      role: input.role ?? UserRole.TECHNICIAN,
      organization_id: organizationId ?? undefined,
    });

    if (error) {
      throw new Error(mapInviteError(error.code, error.message));
    }

    await refreshInviteAndMembershipState();
    const result = data as InviteFunctionResponse;
    return {
      invited_user_id: result.invited_user_id ?? '',
      invite_sent: result.invite_sent,
    };
  };

  const changeUserRole = async (id: string, role: UserRole) => {
    if (!supabase || !organizationId) {
      const next = teamMembers.map((member) => (member.id === id ? { ...member, role } : member));
      refreshUsersFromList(next);
      return;
    }

    const { error } = await changeUserRoleRow(organizationId, id, role);
    if (error) {
      throw new Error(mapRoleChangeError(error.code as ManageUserRoleErrorCode | undefined, error.message));
    }

    await loadResources();
    if (session?.user?.id === id) {
      await refreshProfile();
    }
  };

  const revokeInvite = async (inviteId: string) => {
    if (!supabase) {
      return;
    }

    const { error } = await inviteTechnicianFn({
      email: '',
      full_name: '',
      role: UserRole.TECHNICIAN,
      action: 'revoke',
      invite_id: inviteId,
      organization_id: organizationId ?? undefined,
    });

    if (error) {
      throw new Error(mapInviteError(error.code, error.message));
    }

    await refreshInviteAndMembershipState();
  };

  const resendInvite = async (invite: OrganizationInvite) => {
    if (!supabase) {
      return { resent: false, alreadyExists: false };
    }

    const { data, error } = await inviteTechnicianFn({
      email: invite.email,
      full_name: invite.email,
      role: invite.role,
      action: 'resend',
      invite_id: invite.id,
      organization_id: organizationId ?? undefined,
    });

    if (error) {
      throw new Error(mapInviteError(error.code, error.message));
    }

    await refreshInviteAndMembershipState();
    const result = data as InviteFunctionResponse | null;
    return {
      resent: Boolean(result?.invite_sent),
      alreadyExists: Boolean(result?.already_exists),
    };
  };

  const importCustomersAssets = async (rows: CsvImportRow[], dryRun = false): Promise<CsvImportResult> => {
    if (!supabase) {
      return {
        created: rows.length,
        updated: 0,
        skipped: 0,
        dry_run: dryRun,
        failed: [],
        row_results: rows.map((row, index) => ({
          row: index + 1,
          action: 'created',
          message: 'Demo mode import',
          customer_name: row.customer_name,
          asset_serial_number: row.asset_serial_number,
        })),
        summary: {
          customers_created: rows.length,
          customers_updated: 0,
          assets_created: 0,
          assets_updated: 0,
          rows_processed: rows.length,
          rows_skipped: 0,
        },
      };
    }

    const result = (await importCustomersAssetsFn(rows, dryRun)) as Partial<CsvImportResult>;

    if (!dryRun) {
      await loadResources();
    }

    return {
      created: result.created ?? 0,
      updated: result.updated ?? 0,
      skipped: result.skipped ?? 0,
      dry_run: result.dry_run ?? dryRun,
      failed: result.failed ?? [],
      row_results: result.row_results ?? [],
      summary: result.summary ?? {
        customers_created: 0,
        customers_updated: 0,
        assets_created: 0,
        assets_updated: 0,
        rows_processed: rows.length,
        rows_skipped: 0,
      },
    };
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
    return asset ? `${asset.model} (${asset.serial_number})` : 'N/A';
  };

  const getCustomerName = (id?: string | null) => {
    const customer = getCustomerById(id);
    return customer ? customer.name : 'N/A';
  };

  const value = useMemo<ResourceContextType>(
    () => ({
      customers,
      assets,
      technicians,
      teamMembers,
      inventoryItems,
      pendingInvites,
      loading,
      addCustomer,
      updateCustomer,
      deleteCustomer,
      addAsset,
      updateAsset,
      deleteAsset,
      addTechnician,
      inviteTechnician,
      changeUserRole,
      revokeInvite,
      resendInvite,
      importCustomersAssets,
      getAssetName,
      getCustomerName,
      getAssetById,
      getCustomerById,
      getTechnicianById,
      reload: loadResources,
    }),
    [customers, assets, technicians, teamMembers, inventoryItems, pendingInvites, loading, organizationId],
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
