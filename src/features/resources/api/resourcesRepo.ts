import { supabase } from '@/shared/lib/supabase/client';
import { runtimeConfig } from '@/shared/config/runtime';
import { CsvImportResult, CsvImportRow, OrganizationInvite, Profile, UserRole } from '@/shared/types';

export type InviteFunctionErrorCode =
  | 'INVITE_DUPLICATE'
  | 'ORG_ROLE_MISMATCH'
  | 'MEMBERSHIP_NOT_ACTIVE'
  | 'SESSION_INVALID'
  | 'INVITE_REDIRECT_MISSING'
  | 'INVITE_NOT_FOUND'
  | 'INVALID_INPUT'
  | 'INTERNAL_ERROR';

export type ManageUserRoleErrorCode =
  | 'UNAUTHORIZED'
  | 'INVALID_INPUT'
  | 'ORG_SCOPE_MISMATCH'
  | 'MEMBERSHIP_NOT_FOUND'
  | 'MEMBERSHIP_NOT_ACTIVE'
  | 'LAST_ACTIVE_ADMIN'
  | 'INTERNAL_ERROR';

export interface InviteFunctionResponse {
  invited_user_id: string | null;
  organization_id: string;
  resolved_role: UserRole | null;
  invite_status: 'PENDING' | 'ACCEPTED' | 'REVOKED';
  accepted_directly: boolean;
  invite_sent: boolean;
  next_action: 'login' | 'retry' | 'contact_admin' | 'none';
  invite_id?: string;
  already_exists?: boolean;
  request_id: string;
}

export interface ManageUserRoleResponse {
  ok: true;
  organization_id: string;
  target_user_id: string;
  role: UserRole;
  updated_at: string;
  request_id: string;
  no_op?: boolean;
}

type FunctionErrorCode = InviteFunctionErrorCode | ManageUserRoleErrorCode | string;

interface FunctionInvokeError {
  message: string;
  code?: FunctionErrorCode;
  request_id?: string;
  context?: { status?: number };
}

function debugResourceAuth(message: string, payload?: unknown) {
  if (!(import.meta as any).env?.DEV || !runtimeConfig.authDebugEnabled) return;
  if (payload !== undefined) {
    console.debug(`[resources-auth] ${message}`, payload);
    return;
  }
  console.debug(`[resources-auth] ${message}`);
}

async function parseFunctionInvokeError(rawError: any): Promise<FunctionInvokeError> {
  const normalized: FunctionInvokeError = {
    message: rawError?.message ?? 'Function call failed',
    context:
      typeof rawError?.context === 'object' && rawError?.context !== null
        ? { status: Number(rawError.context.status) || undefined }
        : undefined,
  };

  const responseCandidate = rawError?.context;
  if (responseCandidate && typeof responseCandidate.clone === 'function') {
    try {
      const payload = await responseCandidate.clone().json();
      if (typeof payload?.error === 'string' && payload.error.trim()) {
        normalized.message = payload.error.trim();
      }
      if (typeof payload?.code === 'string' && payload.code.trim()) {
        normalized.code = payload.code.trim() as FunctionErrorCode;
      }
      if (typeof payload?.request_id === 'string' && payload.request_id.trim()) {
        normalized.request_id = payload.request_id.trim();
      }
    } catch {
      // keep normalized fallback message when response body cannot be parsed
    }
  }

  return normalized;
}

function toSessionInvalidError(): FunctionInvokeError {
  return {
    code: 'SESSION_INVALID',
    message: 'Session expired or unauthorized. Please sign in again.',
    context: { status: 401 },
  };
}

function validateInviteFunctionResponse(data: unknown): InviteFunctionResponse {
  if (!data || typeof data !== 'object') {
    throw new Error('Malformed invite function response.');
  }

  const payload = data as Record<string, unknown>;
  const requiredStringKeys = ['organization_id', 'invite_status', 'next_action', 'request_id'] as const;
  for (const key of requiredStringKeys) {
    if (typeof payload[key] !== 'string' || !(payload[key] as string).trim()) {
      throw new Error(`Malformed invite function response: missing ${key}.`);
    }
  }

  return payload as unknown as InviteFunctionResponse;
}

function validateManageUserRoleResponse(data: unknown): ManageUserRoleResponse {
  if (!data || typeof data !== 'object') {
    throw new Error('Malformed manage-user-role response.');
  }

  const payload = data as Record<string, unknown>;
  if (payload.ok !== true) {
    throw new Error('Malformed manage-user-role response: ok flag missing.');
  }
  if (typeof payload.organization_id !== 'string' || !payload.organization_id.trim()) {
    throw new Error('Malformed manage-user-role response: missing organization_id.');
  }
  if (typeof payload.target_user_id !== 'string' || !payload.target_user_id.trim()) {
    throw new Error('Malformed manage-user-role response: missing target_user_id.');
  }
  if (payload.role !== UserRole.ADMIN && payload.role !== UserRole.TECHNICIAN) {
    throw new Error('Malformed manage-user-role response: missing role.');
  }
  if (typeof payload.updated_at !== 'string' || !payload.updated_at.trim()) {
    throw new Error('Malformed manage-user-role response: missing updated_at.');
  }
  if (typeof payload.request_id !== 'string' || !payload.request_id.trim()) {
    throw new Error('Malformed manage-user-role response: missing request_id.');
  }

  return payload as unknown as ManageUserRoleResponse;
}

async function invokeFunctionWithSessionRetry(
  functionName: string,
  input: { method?: 'GET' | 'POST'; body?: Record<string, unknown>; organizationId?: string },
) {
  if (!supabase) {
    throw new Error('Supabase client is not available');
  }

  const isUnauthorizedError = (error: { message?: string; context?: { status?: number } } | null | undefined) => {
    if (!error) return false;
    const status = error.context?.status;
    if (status === 401) return true;
    const message = (error.message ?? '').toLowerCase();
    return /unauthorized|invalid jwt|jwt|401|session expired/.test(message);
  };

  const getActiveSession = async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    debugResourceAuth('session.from_getSession', {
      functionName,
      hasAccessToken: Boolean(session?.access_token),
      userId: session?.user?.id ?? null,
      expiresAt: session?.expires_at ?? null,
    });

    if (session?.access_token) {
      return session;
    }

    const { data: refreshed } = await supabase.auth.refreshSession();
    debugResourceAuth('session.after_refreshSession', {
      functionName,
      hasAccessToken: Boolean(refreshed.session?.access_token),
      userId: refreshed.session?.user?.id ?? null,
      expiresAt: refreshed.session?.expires_at ?? null,
    });

    return refreshed.session ?? null;
  };

  const invoke = async () => {
    const session = await getActiveSession();
    if (!session?.access_token) {
      return {
        data: null,
        error: toSessionInvalidError(),
      };
    }

    const result = await supabase.functions.invoke(functionName, {
      method: input.method,
      body: input.body,
      headers: {
        ...(input.organizationId ? { 'x-organization-id': input.organizationId } : {}),
      },
    });

    if (!result.error) {
      return result;
    }

    return {
      data: null,
      error: await parseFunctionInvokeError(result.error),
    };
  };

  const firstAttempt = await invoke();
  debugResourceAuth('invoke.first_attempt', {
    functionName,
    hasError: Boolean(firstAttempt.error),
    error: firstAttempt.error ? { message: firstAttempt.error.message, context: (firstAttempt.error as any).context ?? null } : null,
  });
  if (!firstAttempt.error) {
    return firstAttempt;
  }

  if (!isUnauthorizedError(firstAttempt.error as { message?: string; context?: { status?: number } })) {
    return firstAttempt;
  }

  const secondAttempt = await invoke();
  debugResourceAuth('invoke.second_attempt', {
    functionName,
    hasError: Boolean(secondAttempt.error),
    error: secondAttempt.error ? { message: secondAttempt.error.message, context: (secondAttempt.error as any).context ?? null } : null,
  });
  if (!secondAttempt.error) {
    return secondAttempt;
  }

  if (isUnauthorizedError(secondAttempt.error)) {
    return {
      data: null,
      error: toSessionInvalidError(),
    };
  }

  return secondAttempt;
}

function mapMembershipRowsToProfiles(rows: any[]): Profile[] {
  return rows
    .map((row) => {
      const profile = row.profile;
      if (!profile || !row.organization_id || !row.role || !row.status) {
        return null;
      }

      return {
        id: profile.id as string,
        organization_id: row.organization_id as string,
        active_organization_id: row.organization_id as string,
        email: profile.email as string,
        full_name: profile.full_name as string,
        role: row.role as UserRole,
        status: row.status,
        avatar_url: profile.avatar_url,
        created_at: profile.created_at as string,
        updated_at: profile.updated_at as string,
      } as Profile;
    })
    .filter((item): item is Profile => item !== null)
    .sort((a, b) => a.full_name.localeCompare(b.full_name));
}

export async function fetchResourcesByOrganization(organizationId: string) {
  if (!supabase) {
    throw new Error('Supabase client is not available');
  }

  const [customersRes, assetsRes, membersRes, inventoryRes] = await Promise.all([
    supabase.from('customers').select('*').eq('organization_id', organizationId).order('name'),
    supabase.from('assets').select('*').eq('organization_id', organizationId).order('created_at', { ascending: false }),
    supabase
      .from('organization_memberships')
      .select('id, user_id, organization_id, role, status, profile:profiles(id, email, full_name, avatar_url, created_at, updated_at)')
      .eq('organization_id', organizationId),
    supabase.from('inventory_items').select('*').eq('organization_id', organizationId).order('name'),
  ]);

  const techsRes = {
    data: membersRes.error ? null : mapMembershipRowsToProfiles((membersRes.data as any[]) ?? []),
    error: membersRes.error,
  };

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
      { event: '*', schema: 'public', table: 'organization_memberships', filter: `organization_id=eq.${organizationId}` },
      onChange,
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'organization_invites', filter: `organization_id=eq.${organizationId}` },
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

export async function changeUserRoleRow(organizationId: string, userId: string, role: UserRole) {
  const { data, error } = await invokeFunctionWithSessionRetry('manage-user-role', {
    method: 'POST',
    organizationId,
    body: {
      target_user_id: userId,
      organization_id: organizationId,
      role,
    },
  });

  if (error) {
    return {
      data: null,
      error,
    };
  }

  return {
    data: validateManageUserRoleResponse(data),
    error: null,
  };
}

export async function inviteTechnicianFn(input: {
  email: string;
  full_name: string;
  role: UserRole;
  action?: 'revoke' | 'resend';
  invite_id?: string;
  organization_id?: string;
}): Promise<{ data: InviteFunctionResponse | null; error: FunctionInvokeError | null }> {
  const { data, error } = await invokeFunctionWithSessionRetry('invite-technician', {
    method: 'POST',
    organizationId: input.organization_id,
    body: {
      email: input.email,
      full_name: input.full_name,
      role: input.role,
      action: input.action,
      invite_id: input.invite_id,
    },
  });

  if (error) {
    return {
      data: null,
      error,
    };
  }

  return {
    data: validateInviteFunctionResponse(data),
    error: null,
  };
}

export async function listPendingInvitesFn(organizationId?: string) {
  const { data, error } = await invokeFunctionWithSessionRetry('invite-technician', {
    method: 'POST',
    organizationId,
    body: {
      action: 'list_pending',
    },
  });

  if (error) {
    throw new Error(error.message);
  }

  return (data?.invites ?? []) as OrganizationInvite[];
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
