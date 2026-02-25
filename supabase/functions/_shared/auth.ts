import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';

interface AdminAuthResult {
  organizationId: string;
  requesterId: string;
}

interface AuthenticatedUserResult {
  userId: string;
  email: string;
}

export class AuthzError extends Error {
  status: number;
  details?: Record<string, unknown>;

  constructor(message: string, status: number, details?: Record<string, unknown>) {
    super(message);
    this.name = 'AuthzError';
    this.status = status;
    this.details = details;
  }
}

function createUserClient(req: Request): SupabaseClient {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');

  if (!supabaseUrl || !anonKey) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_ANON_KEY');
  }

  return createClient(supabaseUrl, anonKey, {
    global: {
      headers: {
        Authorization: req.headers.get('Authorization') ?? '',
      },
    },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

export function createServiceClient(): SupabaseClient {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

export async function requireAuthenticatedUser(req: Request): Promise<AuthenticatedUserResult> {
  const userClient = createUserClient(req);

  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData.user) {
    throw new AuthzError('Unauthorized', 401, {
      stage: 'auth.getUser',
      userError: userError?.message ?? null,
    });
  }

  return {
    userId: userData.user.id,
    email: userData.user.email?.trim().toLowerCase() ?? '',
  };
}

export async function requireAdmin(req: Request): Promise<AdminAuthResult> {
  const userClient = createUserClient(req);
  const service = createServiceClient();

  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData.user) {
    throw new AuthzError('Unauthorized', 401, {
      stage: 'auth.getUser',
      userError: userError?.message ?? null,
    });
  }

  // Use service-role reads after JWT verification to avoid brittle RLS coupling
  // in auth checks (e.g. when active org context and policies are temporarily out of sync).
  const { data: profile, error: profileError } = await service
    .from('profiles')
    .select('organization_id, active_organization_id, role, status')
    .eq('id', userData.user.id)
    .single();

  if (profileError || !profile) {
    throw new AuthzError('Profile not found', 401, {
      stage: 'profiles.select',
      userId: userData.user.id,
      profileError: profileError?.message ?? null,
    });
  }

  const requestedOrganizationId = req.headers.get('x-organization-id')?.trim() || null;
  const organizationId =
    requestedOrganizationId ??
    (profile.active_organization_id as string | null) ??
    (profile.organization_id as string | null);
  if (!organizationId) {
    throw new AuthzError('No active organization selected', 400, {
      stage: 'resolve.organizationId',
      userId: userData.user.id,
      requestedOrganizationId,
      profileOrganizationId: profile.organization_id ?? null,
      profileActiveOrganizationId: profile.active_organization_id ?? null,
    });
  }

  const profileOrganizationId =
    typeof profile.organization_id === 'string' && profile.organization_id.trim().length > 0
      ? profile.organization_id
      : null;
  const profileActiveOrganizationId =
    typeof profile.active_organization_id === 'string' && profile.active_organization_id.trim().length > 0
      ? profile.active_organization_id
      : null;
  const isLegacyAdminProfile = profile.status === 'ACTIVE' && profile.role === 'ADMIN';
  // Legacy fallback is only for temporary migration gaps when membership row is missing.
  // Never allow fallback to escalate into a different org than the profile context.
  const canUseLegacyProfileFallback =
    isLegacyAdminProfile &&
    (profileOrganizationId === organizationId || profileActiveOrganizationId === organizationId);

  const { data: membership, error: membershipError } = await service
    .from('organization_memberships')
    .select('role, status')
    .eq('user_id', userData.user.id)
    .eq('organization_id', organizationId)
    .maybeSingle();

  const membershipErrorCode =
    typeof (membershipError as { code?: unknown } | null)?.code === 'string'
      ? ((membershipError as { code: string }).code ?? '')
      : '';
  const membershipErrorMessage = (membershipError?.message ?? '').toLowerCase();
  const missingMembershipRelation =
    membershipErrorCode === '42P01' ||
    (membershipErrorMessage.includes('organization_memberships') &&
      (membershipErrorMessage.includes('does not exist') || membershipErrorMessage.includes('undefined table')));

  // Compatibility fallback for extreme legacy environments where memberships
  // schema is missing. Do not fallback when the row is simply absent.
  if (membershipError) {
    if (missingMembershipRelation && canUseLegacyProfileFallback) {
      return {
        organizationId,
        requesterId: userData.user.id,
      };
    }

    throw new AuthzError('Unauthorized', 401, {
      stage: 'organization_memberships.select',
      userId: userData.user.id,
      organizationId,
      membershipError: membershipError.message ?? null,
      membershipCode: membershipErrorCode || null,
      membershipFound: false,
      profileRole: profile.role ?? null,
      profileStatus: profile.status ?? null,
      profileOrganizationId,
      profileActiveOrganizationId,
      isLegacyAdminProfile,
      canUseLegacyProfileFallback,
      missingMembershipRelation,
    });
  }

  if (!membership) {
    throw new AuthzError('Unauthorized', 401, {
      stage: 'membership.missing',
      userId: userData.user.id,
      organizationId,
      membershipFound: false,
      profileRole: profile.role ?? null,
      profileStatus: profile.status ?? null,
      profileOrganizationId,
      profileActiveOrganizationId,
      isLegacyAdminProfile,
      canUseLegacyProfileFallback,
      missingMembershipRelation,
    });
  }

  if (membership.status !== 'ACTIVE' || membership.role !== 'ADMIN') {
    if (membership.status !== 'ACTIVE') {
      throw new AuthzError('Unauthorized', 401, {
        stage: 'membership.status',
        userId: userData.user.id,
        organizationId,
        membershipRole: membership.role ?? null,
        membershipStatus: membership.status ?? null,
        profileOrganizationId,
        profileActiveOrganizationId,
      });
    }

    throw new AuthzError('Admin privileges required', 403, {
      stage: 'membership.role',
      userId: userData.user.id,
      organizationId,
      membershipRole: membership.role ?? null,
      membershipStatus: membership.status ?? null,
      profileOrganizationId,
      profileActiveOrganizationId,
    });
  }

  return {
    organizationId,
    requesterId: userData.user.id,
  };
}
