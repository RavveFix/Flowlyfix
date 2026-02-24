import { corsHeaders, jsonResponse } from '../_shared/http.ts';
import { createServiceClient, requireAdmin } from '../_shared/auth.ts';

interface InvitePayload {
  email?: string;
  full_name?: string;
  role?: 'ADMIN' | 'TECHNICIAN';
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    if (req.method !== 'POST') {
      return jsonResponse({ error: 'Method not allowed' }, 405);
    }

    const { organizationId } = await requireAdmin(req);
    const payload = (await req.json()) as InvitePayload;

    const email = payload.email?.trim().toLowerCase();
    const fullName = payload.full_name?.trim();
    const role = payload.role ?? 'TECHNICIAN';

    if (!email || !fullName) {
      return jsonResponse({ error: 'email and full_name are required' }, 400);
    }

    if (!['ADMIN', 'TECHNICIAN'].includes(role)) {
      return jsonResponse({ error: 'role must be ADMIN or TECHNICIAN' }, 400);
    }

    const service = createServiceClient();

    const { data: inviteData, error: inviteError } = await service.auth.admin.inviteUserByEmail(email, {
      data: {
        full_name: fullName,
        role,
        organization_id: organizationId,
      },
      redirectTo: Deno.env.get('INVITE_REDIRECT_URL'),
    });

    if (inviteError) {
      return jsonResponse({ error: inviteError.message }, 400);
    }

    const invitedUserId = inviteData.user?.id;
    if (!invitedUserId) {
      return jsonResponse({ error: 'No invited user returned' }, 500);
    }

    const { error: profileError } = await service.from('profiles').upsert(
      {
        id: invitedUserId,
        organization_id: organizationId,
        email,
        full_name: fullName,
        role,
        status: 'ACTIVE',
      },
      {
        onConflict: 'id',
      },
    );

    if (profileError) {
      return jsonResponse({ error: profileError.message }, 400);
    }

    return jsonResponse({
      invited_user_id: invitedUserId,
      invite_sent: true,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error';
    const status = message === 'Unauthorized' ? 401 : message === 'Admin privileges required' ? 403 : 500;
    return jsonResponse({ error: message }, status);
  }
});
