import { createClient } from '@supabase/supabase-js';

interface RoleFixtureResult {
  organizationId: string;
  organizationName: string;
  source: 'existing' | 'created';
}

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

function resolveServiceRoleKey() {
  return (
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    process.env.SERVICE_ROLE_KEY?.trim() ||
    ''
  );
}

function buildHelperEmailCandidate(
  row: { profile?: { email?: string | null } | Array<{ email?: string | null }> | null } | null | undefined,
) {
  if (!row) return '';
  const profileNode = Array.isArray(row.profile) ? row.profile[0] : row.profile;
  const email = (profileNode?.email ?? '').trim();
  return email;
}

async function ensureViaAuthenticatedUserClient(params: {
  supabaseUrl: string;
  anonKey: string;
  adminEmail: string;
  adminPassword: string;
}): Promise<RoleFixtureResult | null> {
  const { supabaseUrl, anonKey, adminEmail, adminPassword } = params;
  const authClient = createClient(supabaseUrl, anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  const signInRes = await authClient.auth.signInWithPassword({
    email: adminEmail,
    password: adminPassword,
  });
  const accessToken = signInRes.data.session?.access_token ?? null;
  if (signInRes.error || !signInRes.data.user?.id || !accessToken) {
    return null;
  }

  const client = createClient(supabaseUrl, anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  });

  const userId = signInRes.data.user.id;
  try {
    const profileRes = await client
      .from('profiles')
      .select('id, full_name, organization_id, active_organization_id')
      .eq('id', userId)
      .maybeSingle();
    if (profileRes.error || !profileRes.data) {
      return null;
    }

    const profile = profileRes.data as {
      full_name?: string | null;
      organization_id?: string | null;
      active_organization_id?: string | null;
    };
    const originalOrgId = profile.active_organization_id ?? profile.organization_id ?? null;
    if (!originalOrgId) {
      return null;
    }

    const activeMembershipsRes = await client
      .from('organization_memberships')
      .select('organization_id, role, status, organization:organizations(name)')
      .eq('user_id', userId)
      .eq('status', 'ACTIVE');
    if (activeMembershipsRes.error) {
      return null;
    }

    const activeMemberships = (activeMembershipsRes.data ?? []) as Array<{
      organization_id?: string | null;
      role?: string | null;
      organization?: { name?: string | null } | Array<{ name?: string | null }> | null;
    }>;
    const existingTech = activeMemberships.find(
      (row) => typeof row.organization_id === 'string' && row.role === 'TECHNICIAN',
    );
    if (existingTech?.organization_id) {
      const organizationNode = Array.isArray(existingTech.organization)
        ? existingTech.organization[0]
        : existingTech.organization;
      return {
        organizationId: existingTech.organization_id,
        organizationName: organizationNode?.name ?? 'Fixture Organization',
        source: 'existing',
      };
    }

    const sameOrgOtherMemberRes = await client
      .from('organization_memberships')
      .select('user_id, profile:profiles(email)')
      .eq('organization_id', originalOrgId)
      .eq('status', 'ACTIVE')
      .neq('user_id', userId)
      .limit(1)
      .maybeSingle();

    const helperMemberEmail =
      sameOrgOtherMemberRes.error || !sameOrgOtherMemberRes.data
        ? ''
        : buildHelperEmailCandidate(
            sameOrgOtherMemberRes.data as
              | { profile?: { email?: string | null } | Array<{ email?: string | null }> | null }
              | null,
          );

    const organizationName = `E2E Role Fixture ${Date.now()}`;
    const signupRes = await client.functions.invoke('self-signup-organization', {
      body: {
        organization_name: organizationName,
        admin_full_name: profile.full_name?.trim() || 'E2E Admin',
      },
    });

    const signupPayload = (signupRes.data ?? null) as {
      ok?: boolean;
      organization?: { id?: string | null; name?: string | null } | null;
      error?: string;
    } | null;
    const newOrgId =
      signupRes.error || !signupPayload || signupPayload.error || !signupPayload.organization?.id
        ? null
        : signupPayload.organization.id;

    if (!newOrgId) {
      return null;
    }

    const helperEmail = helperMemberEmail || `e2e.role.fixture.${Date.now()}@example.com`;
    const inviteRes = await client.functions.invoke('invite-technician', {
      headers: {
        'x-organization-id': newOrgId,
      },
      body: {
        email: helperEmail,
        full_name: 'E2E Role Fixture Admin',
        role: 'ADMIN',
      },
    });
    const invitePayload = (inviteRes.data ?? null) as { error?: string } | null;
    if (inviteRes.error || invitePayload?.error) {
      return null;
    }

    const demoteRes = await client.functions.invoke('manage-user-role', {
      headers: {
        'x-organization-id': newOrgId,
      },
      body: {
        target_user_id: userId,
        organization_id: newOrgId,
        role: 'TECHNICIAN',
      },
    });
    const demotePayload = (demoteRes.data ?? null) as { error?: string } | null;
    if (demoteRes.error || demotePayload?.error) {
      return null;
    }

    const restoreRes = await client.functions.invoke('switch-active-organization', {
      body: {
        organization_id: originalOrgId,
      },
    });
    const restorePayload = (restoreRes.data ?? null) as { error?: string } | null;
    if (restoreRes.error || restorePayload?.error) {
      return null;
    }

    return {
      organizationId: newOrgId,
      organizationName: signupPayload.organization?.name ?? organizationName,
      source: 'created',
    };
  } finally {
    await authClient.auth.signOut();
  }
}

export async function ensureTechnicianRoleFixtureForAdminUser(): Promise<RoleFixtureResult | null> {
  const supabaseUrl = process.env.VITE_SUPABASE_URL?.trim() || '';
  const serviceRoleKey = resolveServiceRoleKey();
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY?.trim() || '';
  const adminEmail = process.env.E2E_ADMIN_EMAIL?.trim() || '';
  const adminPassword = process.env.E2E_ADMIN_PASSWORD?.trim() || '';

  if (!supabaseUrl || !adminEmail) {
    return null;
  }

  if (!serviceRoleKey) {
    if (!anonKey || !adminPassword) {
      return null;
    }
    return ensureViaAuthenticatedUserClient({
      supabaseUrl,
      anonKey,
      adminEmail,
      adminPassword,
    });
  }

  const service = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  const normalizedEmail = normalizeEmail(adminEmail);
  const userList = await service.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (userList.error) {
    throw new Error(`Role fixture failed to list users: ${userList.error.message}`);
  }

  const users = (userList.data?.users ?? []) as Array<{ id?: string; email?: string | null }>;
  const authUser = users.find((candidate) => normalizeEmail(candidate.email ?? '') === normalizedEmail);
  if (!authUser?.id) {
    throw new Error(`Role fixture could not find auth user for ${adminEmail}.`);
  }

  const existingTechMembership = await service
    .from('organization_memberships')
    .select('organization_id, role, status, organization:organizations(name)')
    .eq('user_id', authUser.id)
    .eq('role', 'TECHNICIAN')
    .eq('status', 'ACTIVE')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existingTechMembership.error) {
    throw new Error(`Role fixture failed to read memberships: ${existingTechMembership.error.message}`);
  }

  const existingData = (existingTechMembership.data ?? null) as
    | {
        organization_id?: string | null;
        organization?: { name?: string | null } | Array<{ name?: string | null }> | null;
      }
    | null;

  if (existingData?.organization_id) {
    const organizationNode = Array.isArray(existingData.organization)
      ? existingData.organization[0]
      : existingData.organization;

    return {
      organizationId: existingData.organization_id,
      organizationName: organizationNode?.name ?? 'Fixture Organization',
      source: 'existing',
    };
  }

  const organizationName = `E2E Role Fixture ${Date.now()}`;
  const createdOrg = await service
    .from('organizations')
    .insert({
      name: organizationName,
    })
    .select('id, name')
    .single();

  if (createdOrg.error || !createdOrg.data?.id) {
    throw new Error(`Role fixture failed to create organization: ${createdOrg.error?.message ?? 'unknown error'}`);
  }

  const createdMembership = await service
    .from('organization_memberships')
    .insert({
      user_id: authUser.id,
      organization_id: createdOrg.data.id,
      role: 'TECHNICIAN',
      status: 'ACTIVE',
      is_default: false,
    })
    .select('organization_id')
    .single();

  if (createdMembership.error || !createdMembership.data?.organization_id) {
    throw new Error(
      `Role fixture failed to create technician membership: ${createdMembership.error?.message ?? 'unknown error'}`,
    );
  }

  return {
    organizationId: createdMembership.data.organization_id as string,
    organizationName: createdOrg.data.name as string,
    source: 'created',
  };
}
