import { corsHeaders, jsonResponse } from '../_shared/http.ts';
import { createServiceClient, requireAdmin } from '../_shared/auth.ts';

type ManageAction = 'deactivate_user' | 'reactivate_user' | 'change_role' | 'delete_user_hard';
type UserRole = 'ADMIN' | 'TECHNICIAN';

interface ManagePayload {
  action?: ManageAction;
  user_id?: string;
  role?: UserRole;
}

function mapErrorStatus(message: string) {
  if (message === 'Unauthorized') return 401;
  if (message === 'Admin privileges required') return 403;
  if (message.includes('last active admin') || message.includes('Admin must remain ACTIVE')) return 409;
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

    const { organizationId } = await requireAdmin(req);
    const payload = (await req.json()) as ManagePayload;

    const action = payload.action;
    const userId = payload.user_id?.trim();

    if (!action || !userId) {
      return jsonResponse({ error: 'action and user_id are required' }, 400);
    }

    if (!['deactivate_user', 'reactivate_user', 'change_role', 'delete_user_hard'].includes(action)) {
      return jsonResponse({ error: 'Unsupported action' }, 400);
    }

    const service = createServiceClient();

    const { data: targetProfile, error: targetError } = await service
      .from('profiles')
      .select('id, organization_id, role, status')
      .eq('id', userId)
      .eq('organization_id', organizationId)
      .maybeSingle();

    if (targetError) {
      return jsonResponse({ error: targetError.message }, 400);
    }

    if (!targetProfile) {
      return jsonResponse({ error: 'User not found in this organization' }, 404);
    }

    if (action === 'change_role') {
      const role = payload.role;
      if (!role || !['ADMIN', 'TECHNICIAN'].includes(role)) {
        return jsonResponse({ error: 'role must be ADMIN or TECHNICIAN for change_role' }, 400);
      }

      const { error } = await service
        .from('profiles')
        .update({ role })
        .eq('id', userId)
        .eq('organization_id', organizationId);

      if (error) {
        return jsonResponse({ error: error.message }, mapErrorStatus(error.message));
      }

      return jsonResponse({ ok: true, user_id: userId, action });
    }

    if (action === 'deactivate_user') {
      const { error } = await service
        .from('profiles')
        .update({ status: 'INACTIVE' })
        .eq('id', userId)
        .eq('organization_id', organizationId);

      if (error) {
        return jsonResponse({ error: error.message }, mapErrorStatus(error.message));
      }

      return jsonResponse({ ok: true, user_id: userId, action });
    }

    if (action === 'reactivate_user') {
      const { error } = await service
        .from('profiles')
        .update({ status: 'ACTIVE' })
        .eq('id', userId)
        .eq('organization_id', organizationId);

      if (error) {
        return jsonResponse({ error: error.message }, mapErrorStatus(error.message));
      }

      return jsonResponse({ ok: true, user_id: userId, action });
    }

    const warnings: string[] = [];
    const { error: deleteAuthError } = await service.auth.admin.deleteUser(userId);

    if (deleteAuthError) {
      return jsonResponse({ error: deleteAuthError.message }, 400);
    }

    const { error: profileDeleteError } = await service
      .from('profiles')
      .delete()
      .eq('id', userId)
      .eq('organization_id', organizationId);

    if (profileDeleteError) {
      warnings.push(`Profile cleanup warning: ${profileDeleteError.message}`);
    }

    return jsonResponse({ ok: true, user_id: userId, action, warnings: warnings.length ? warnings : undefined });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error';
    return jsonResponse({ error: message }, mapErrorStatus(message));
  }
});
