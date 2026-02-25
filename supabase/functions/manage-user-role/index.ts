import { AuthzError, createServiceClient, requireAdmin } from '../_shared/auth.ts';
import { corsHeaders, jsonResponse } from '../_shared/http.ts';

type Role = 'ADMIN' | 'TECHNICIAN';

type RoleErrorCode =
  | 'UNAUTHORIZED'
  | 'INVALID_INPUT'
  | 'ORG_SCOPE_MISMATCH'
  | 'MEMBERSHIP_NOT_FOUND'
  | 'MEMBERSHIP_NOT_ACTIVE'
  | 'LAST_ACTIVE_ADMIN'
  | 'INTERNAL_ERROR';

interface Payload {
  target_user_id?: string;
  organization_id?: string;
  role?: Role;
  reason?: string;
}

function buildRequestId(req: Request) {
  return req.headers.get('x-request-id')?.trim() || crypto.randomUUID();
}

function isUuid(value: string | null | undefined) {
  if (!value) return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function errorResponse(requestId: string, code: RoleErrorCode, error: string, status: number, details?: Record<string, unknown>) {
  return jsonResponse(
    {
      code,
      error,
      request_id: requestId,
      ...(details ?? {}),
    },
    status,
  );
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const requestId = buildRequestId(req);

  try {
    if (req.method !== 'POST') {
      return errorResponse(requestId, 'INVALID_INPUT', 'Method not allowed', 405);
    }

    const auth = await requireAdmin(req);
    const payload = (await req.json()) as Payload;

    const targetUserId = payload.target_user_id?.trim() ?? '';
    const organizationId = payload.organization_id?.trim() ?? '';
    const role = payload.role;
    const reason = payload.reason?.trim() ?? null;

    if (!isUuid(targetUserId) || !isUuid(organizationId) || !role) {
      return errorResponse(
        requestId,
        'INVALID_INPUT',
        'target_user_id, organization_id and role are required.',
        400,
      );
    }

    if (role !== 'ADMIN' && role !== 'TECHNICIAN') {
      return errorResponse(requestId, 'INVALID_INPUT', 'role must be ADMIN or TECHNICIAN.', 400);
    }

    if (organizationId !== auth.organizationId) {
      return errorResponse(
        requestId,
        'ORG_SCOPE_MISMATCH',
        'Body organization_id does not match authenticated admin context.',
        403,
        {
          authenticated_organization_id: auth.organizationId,
          requested_organization_id: organizationId,
        },
      );
    }

    const service = createServiceClient();

    const { data: membership, error: membershipError } = await service
      .from('organization_memberships')
      .select('id, role, status')
      .eq('user_id', targetUserId)
      .eq('organization_id', organizationId)
      .maybeSingle();

    if (membershipError) {
      return errorResponse(requestId, 'INTERNAL_ERROR', membershipError.message, 400);
    }

    if (!membership) {
      return errorResponse(
        requestId,
        'MEMBERSHIP_NOT_FOUND',
        'Target user has no membership in this organization.',
        404,
      );
    }

    if (membership.status !== 'ACTIVE') {
      return errorResponse(
        requestId,
        'MEMBERSHIP_NOT_ACTIVE',
        'Target user membership must be ACTIVE to change role.',
        409,
        { membership_status: membership.status },
      );
    }

    if (membership.role === role) {
      return jsonResponse({
        ok: true,
        organization_id: organizationId,
        target_user_id: targetUserId,
        role,
        updated_at: new Date().toISOString(),
        request_id: requestId,
        no_op: true,
      });
    }

    const { data: updatedMembership, error: updateError } = await service
      .from('organization_memberships')
      .update({ role })
      .eq('id', membership.id)
      .select('updated_at, role, status')
      .single();

    if (updateError) {
      const isLastAdminGuard =
        updateError.code === '42501' &&
        /last active admin|cannot remove role\/status from the last active admin/i.test(updateError.message);

      if (isLastAdminGuard) {
        return errorResponse(
          requestId,
          'LAST_ACTIVE_ADMIN',
          'Cannot remove admin role from the last active admin in the organization.',
          409,
        );
      }

      return errorResponse(requestId, 'INTERNAL_ERROR', updateError.message, 400);
    }

    const { error: auditError } = await service.from('membership_role_audit_logs').insert({
      organization_id: organizationId,
      target_user_id: targetUserId,
      changed_by_user_id: auth.requesterId,
      from_role: membership.role,
      to_role: role,
      from_status: membership.status,
      to_status: updatedMembership.status,
      reason,
    });

    if (auditError) {
      console.error('[manage-user-role] audit insert failed', {
        requestId,
        message: auditError.message,
      });
    }

    return jsonResponse({
      ok: true,
      organization_id: organizationId,
      target_user_id: targetUserId,
      role,
      updated_at: updatedMembership.updated_at ?? new Date().toISOString(),
      request_id: requestId,
    });
  } catch (error) {
    if (error instanceof AuthzError) {
      const code: RoleErrorCode =
        error.status === 400 ? 'INVALID_INPUT' : error.status === 401 || error.status === 403 ? 'UNAUTHORIZED' : 'INTERNAL_ERROR';
      return errorResponse(requestId, code, error.message, error.status, error.details);
    }

    const message = error instanceof Error ? error.message : 'Unexpected error';
    return errorResponse(requestId, 'INTERNAL_ERROR', message, 500);
  }
});
