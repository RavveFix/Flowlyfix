import { corsHeaders, jsonResponse } from '../_shared/http.ts';
import { createServiceClient, requireAuthenticatedUser } from '../_shared/auth.ts';

interface SignupPayload {
  organization_name?: string;
  admin_full_name?: string;
}

function parseAllowedDomains() {
  return (Deno.env.get('SIGNUP_ALLOWED_EMAIL_DOMAINS') ?? '')
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

function emailDomain(email: string) {
  const parts = email.split('@');
  return parts.length === 2 ? parts[1].toLowerCase() : '';
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    if (req.method !== 'POST') {
      return jsonResponse({ error: 'Method not allowed' }, 405);
    }

    const { userId, email } = await requireAuthenticatedUser(req);
    const payload = (await req.json()) as SignupPayload;

    const organizationName = payload.organization_name?.trim();
    const adminFullName = payload.admin_full_name?.trim();

    if (!organizationName || !adminFullName) {
      return jsonResponse({ error: 'organization_name and admin_full_name are required' }, 400);
    }

    const allowedDomains = parseAllowedDomains();
    if (allowedDomains.length === 0) {
      return jsonResponse({ error: 'Self-signup is not enabled' }, 403);
    }

    const domain = emailDomain(email);
    if (!domain || !allowedDomains.includes(domain)) {
      return jsonResponse({ error: 'Email domain is not allowed for self-signup' }, 403);
    }

    const service = createServiceClient();

    const { data: org, error: orgError } = await service
      .from('organizations')
      .insert({ name: organizationName })
      .select('*')
      .single();

    if (orgError) {
      return jsonResponse({ error: orgError.message }, 400);
    }

    const organizationId = org.id as string;

    const { error: profileError } = await service.from('profiles').upsert(
      {
        id: userId,
        organization_id: organizationId,
        active_organization_id: organizationId,
        email,
        full_name: adminFullName,
        role: 'ADMIN',
        status: 'ACTIVE',
      },
      { onConflict: 'id' },
    );

    if (profileError) {
      return jsonResponse({ error: profileError.message }, 400);
    }

    const { error: membershipError } = await service.from('organization_memberships').upsert(
      {
        user_id: userId,
        organization_id: organizationId,
        role: 'ADMIN',
        status: 'ACTIVE',
        is_default: true,
      },
      { onConflict: 'user_id,organization_id' },
    );

    if (membershipError) {
      return jsonResponse({ error: membershipError.message }, 400);
    }

    const { error: clearDefaultError } = await service
      .from('organization_memberships')
      .update({ is_default: false })
      .eq('user_id', userId)
      .neq('organization_id', organizationId)
      .eq('is_default', true);

    if (clearDefaultError) {
      return jsonResponse({ error: clearDefaultError.message }, 400);
    }

    return jsonResponse({ ok: true, organization: org, role: 'ADMIN', status: 'ACTIVE' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error';
    const status = message === 'Unauthorized' ? 401 : 500;
    return jsonResponse({ error: message }, status);
  }
});
