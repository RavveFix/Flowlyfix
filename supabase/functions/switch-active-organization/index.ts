import { corsHeaders, jsonResponse } from '../_shared/http.ts';
import { createServiceClient, requireAuthenticatedUser } from '../_shared/auth.ts';

interface SwitchPayload {
  organization_id?: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    if (req.method !== 'POST') {
      return jsonResponse({ error: 'Method not allowed' }, 405);
    }

    const { userId } = await requireAuthenticatedUser(req);
    const payload = (await req.json()) as SwitchPayload;
    const organizationId = payload.organization_id?.trim();

    if (!organizationId) {
      return jsonResponse({ error: 'organization_id is required' }, 400);
    }

    const service = createServiceClient();

    const { data: membership, error: membershipError } = await service
      .from('organization_memberships')
      .select('id, status')
      .eq('user_id', userId)
      .eq('organization_id', organizationId)
      .maybeSingle();

    if (membershipError) {
      return jsonResponse({ error: membershipError.message }, 400);
    }

    if (!membership || membership.status !== 'ACTIVE') {
      return jsonResponse({ error: 'You are not an active member of this organization' }, 403);
    }

    const { error: profileUpdateError } = await service
      .from('profiles')
      .update({ active_organization_id: organizationId })
      .eq('id', userId);

    if (profileUpdateError) {
      return jsonResponse({ error: profileUpdateError.message }, 400);
    }

    return jsonResponse({ ok: true, active_organization_id: organizationId });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error';
    const status = message === 'Unauthorized' ? 401 : 500;
    return jsonResponse({ error: message }, status);
  }
});
