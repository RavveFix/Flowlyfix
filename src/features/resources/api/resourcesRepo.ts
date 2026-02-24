import { supabase } from '@/shared/lib/supabase/client';
import { CsvImportResult, CsvImportRow, UserRole } from '@/shared/types';

export async function fetchResourcesByOrganization(organizationId: string) {
  if (!supabase) {
    throw new Error('Supabase client is not available');
  }

  const [customersRes, assetsRes, techsRes, inventoryRes] = await Promise.all([
    supabase.from('customers').select('*').eq('organization_id', organizationId).order('name'),
    supabase.from('assets').select('*').eq('organization_id', organizationId).order('created_at', { ascending: false }),
    supabase.from('profiles').select('*').eq('organization_id', organizationId).order('full_name'),
    supabase.from('inventory_items').select('*').eq('organization_id', organizationId).order('name'),
  ]);

  return { customersRes, assetsRes, techsRes, inventoryRes };
}

export function subscribeToResourceChanges(organizationId: string, onChange: () => void) {
  if (!supabase) {
    return () => {};
  }

  const channel = supabase
    .channel(`resources-${organizationId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'customers', filter: `organization_id=eq.${organizationId}` },
      onChange,
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'assets', filter: `organization_id=eq.${organizationId}` },
      onChange,
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'profiles', filter: `organization_id=eq.${organizationId}` },
      onChange,
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

export async function addCustomerRow(organizationId: string, payload: Record<string, unknown>) {
  if (!supabase) {
    throw new Error('Supabase client is not available');
  }

  return supabase
    .from('customers')
    .insert({
      organization_id: organizationId,
      ...payload,
    })
    .select('*')
    .single();
}

export async function updateCustomerRow(organizationId: string, id: string, updates: Record<string, unknown>) {
  if (!supabase) {
    throw new Error('Supabase client is not available');
  }

  return supabase.from('customers').update(updates).eq('id', id).eq('organization_id', organizationId);
}

export async function deleteCustomerRow(organizationId: string, id: string) {
  if (!supabase) {
    throw new Error('Supabase client is not available');
  }

  return supabase.from('customers').delete().eq('id', id).eq('organization_id', organizationId);
}

export async function addAssetRow(organizationId: string, payload: Record<string, unknown>) {
  if (!supabase) {
    throw new Error('Supabase client is not available');
  }

  return supabase
    .from('assets')
    .insert({
      organization_id: organizationId,
      ...payload,
    })
    .select('*')
    .single();
}

export async function updateAssetRow(organizationId: string, id: string, updates: Record<string, unknown>) {
  if (!supabase) {
    throw new Error('Supabase client is not available');
  }

  return supabase.from('assets').update(updates).eq('id', id).eq('organization_id', organizationId);
}

export async function deleteAssetRow(organizationId: string, id: string) {
  if (!supabase) {
    throw new Error('Supabase client is not available');
  }

  return supabase.from('assets').delete().eq('id', id).eq('organization_id', organizationId);
}

export async function manageUserFn(input: {
  action: 'deactivate_user' | 'reactivate_user' | 'change_role' | 'delete_user_hard';
  user_id: string;
  role?: UserRole;
}) {
  if (!supabase) {
    throw new Error('Supabase client is not available');
  }

  const requestBody = {
    action: input.action,
    user_id: input.user_id,
    role: input.role,
  };

  const invokeManageUser = async () => {
    let {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.access_token) {
      const { data: refreshed } = await supabase.auth.refreshSession();
      session = refreshed.session;
    }

    if (!session?.access_token) {
      return {
        data: null,
        error: {
          message: 'No active session. Please sign in again.',
          context: { status: 401 },
        },
      };
    }

    return supabase.functions.invoke('manage-user', {
      body: requestBody,
      headers: {
        Authorization: `Bearer ${session.access_token}`,
      },
    });
  };

  const firstAttempt = await invokeManageUser();
  if (!firstAttempt.error) {
    return firstAttempt;
  }

  const status = (firstAttempt.error as { context?: { status?: number } }).context?.status;
  if (status !== 401) {
    return firstAttempt;
  }

  await supabase.auth.refreshSession();
  const secondAttempt = await invokeManageUser();
  if (!secondAttempt.error) {
    return secondAttempt;
  }

  const secondStatus = (secondAttempt.error as { context?: { status?: number } }).context?.status;
  if (secondStatus === 401) {
    return {
      data: null,
      error: {
        ...secondAttempt.error,
        message: 'Session expired or unauthorized. Please sign in again.',
      },
    };
  }

  return secondAttempt;
}

export async function inviteTechnicianFn(input: {
  email: string;
  full_name: string;
  role: UserRole;
}) {
  if (!supabase) {
    throw new Error('Supabase client is not available');
  }

  return supabase.functions.invoke('invite-technician', {
    body: {
      email: input.email,
      full_name: input.full_name,
      role: input.role,
    },
  });
}

export async function importCustomersAssetsFn(rows: CsvImportRow[], dryRun: boolean): Promise<CsvImportResult> {
  if (!supabase) {
    throw new Error('Supabase client is not available');
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

  return (data ?? {}) as CsvImportResult;
}
