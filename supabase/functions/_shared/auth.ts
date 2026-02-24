import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';

interface AdminAuthResult {
  organizationId: string;
  requesterId: string;
}

interface AuthenticatedUserResult {
  userId: string;
  email: string;
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
    throw new Error('Unauthorized');
  }

  return {
    userId: userData.user.id,
    email: userData.user.email?.trim().toLowerCase() ?? '',
  };
}

export async function requireAdmin(req: Request): Promise<AdminAuthResult> {
  const userClient = createUserClient(req);

  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData.user) {
    throw new Error('Unauthorized');
  }

  const { data: profile, error: profileError } = await userClient
    .from('profiles')
    .select('organization_id, role, status')
    .eq('id', userData.user.id)
    .single();

  if (profileError || !profile) {
    throw new Error('Profile not found');
  }

  if (profile.status !== 'ACTIVE') {
    throw new Error('Unauthorized');
  }

  if (profile.role !== 'ADMIN') {
    throw new Error('Admin privileges required');
  }

  return {
    organizationId: profile.organization_id as string,
    requesterId: userData.user.id,
  };
}
