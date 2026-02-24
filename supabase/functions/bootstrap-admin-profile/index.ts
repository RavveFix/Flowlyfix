import { corsHeaders, jsonResponse } from '../_shared/http.ts';
import { createServiceClient, requireAuthenticatedUser } from '../_shared/auth.ts';

interface BootstrapPayload {
  organization_id?: string;
  full_name?: string;
}

function mapErrorStatus(message: string) {
  if (message === 'Unauthorized') return 401;
  if (message.includes('already exists')) return 409;
  return 400;
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
    const payload = (await req.json()) as BootstrapPayload;
    const organizationId = payload.organization_id?.trim();
    const fullName = payload.full_name?.trim();

    if (!organizationId || !fullName) {
      return jsonResponse({ error: 'organization_id and full_name are required' }, 400);
    }

    const service = createServiceClient();

    const { data: existingProfile, error: existingProfileError } = await service
      .from('profiles')
      .select('id')
      .eq('id', userId)
      .maybeSingle();

    if (existingProfileError) {
      return jsonResponse({ error: existingProfileError.message }, 400);
    }

    if (existingProfile) {
      return jsonResponse({ error: 'Profile already exists for this user' }, 409);
    }

    const { data: org, error: orgError } = await service
      .from('organizations')
      .select('id')
      .eq('id', organizationId)
      .maybeSingle();

    if (orgError) {
      return jsonResponse({ error: orgError.message }, 400);
    }

    if (!org) {
      return jsonResponse({ error: 'Organization not found' }, 404);
    }

    const { count: adminCount, error: adminCountError } = await service
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', organizationId)
      .eq('role', 'ADMIN')
      .eq('status', 'ACTIVE');

    if (adminCountError) {
      return jsonResponse({ error: adminCountError.message }, 400);
    }

    if ((adminCount ?? 0) > 0) {
      return jsonResponse({ error: 'Active admin already exists for this organization' }, 409);
    }

    const { error: createProfileError } = await service.from('profiles').insert({
      id: userId,
      organization_id: organizationId,
      email,
      full_name: fullName,
      role: 'ADMIN',
      status: 'ACTIVE',
    });

    if (createProfileError) {
      return jsonResponse({ error: createProfileError.message }, 400);
    }

    return jsonResponse({ ok: true, user_id: userId, role: 'ADMIN', status: 'ACTIVE' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error';
    return jsonResponse({ error: message }, mapErrorStatus(message));
  }
});
