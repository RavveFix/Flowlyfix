import { corsHeaders, jsonResponse } from '../_shared/http.ts';
import { AuthzError, createServiceClient, requireAdmin } from '../_shared/auth.ts';

type InviteRole = 'ADMIN' | 'TECHNICIAN';
type InviteStatus = 'PENDING' | 'ACCEPTED' | 'REVOKED';
type NextAction = 'login' | 'retry' | 'contact_admin' | 'none';
type InviteErrorCode =
  | 'INVITE_DUPLICATE'
  | 'ORG_ROLE_MISMATCH'
  | 'MEMBERSHIP_NOT_ACTIVE'
  | 'SESSION_INVALID'
  | 'INVITE_REDIRECT_MISSING'
  | 'INVITE_NOT_FOUND'
  | 'INVALID_INPUT'
  | 'INTERNAL_ERROR';

interface InvitePayload {
  email?: string;
  full_name?: string;
  role?: InviteRole;
  action?: 'revoke' | 'resend' | 'list_pending';
  invite_id?: string;
}

const INVITE_EXPIRY_DAYS = 7;

interface InviteApiResponse {
  invited_user_id: string | null;
  organization_id: string;
  resolved_role: InviteRole | null;
  invite_status: InviteStatus;
  accepted_directly: boolean;
  invite_sent: boolean;
  next_action: NextAction;
  invite_id?: string;
  already_exists?: boolean;
  request_id: string;
}

type MembershipResolutionResult =
  | {
      ok: true;
      response: null;
      resolvedRole: InviteRole;
    }
  | {
      ok: false;
      response: Response;
      resolvedRole: null;
    };

function normalizeEmail(input?: string) {
  return input?.trim().toLowerCase() ?? '';
}

function buildRequestId(req: Request) {
  return req.headers.get('x-request-id')?.trim() || crypto.randomUUID();
}

function errorResponse(
  requestId: string,
  code: InviteErrorCode,
  error: string,
  status: number,
  details?: Record<string, unknown>,
) {
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

function successResponse(payload: InviteApiResponse) {
  return jsonResponse(payload);
}

function isAlreadyInvitedOrRegisteredError(message: string) {
  const normalized = message.toLowerCase();
  return (
    normalized.includes('already registered') ||
    normalized.includes('already been registered') ||
    normalized.includes('already exists') ||
    normalized.includes('already invited') ||
    normalized.includes('has already been invited')
  );
}

function inviteResponseBase(
  requestId: string,
  organizationId: string,
  inviteStatus: InviteStatus,
  nextAction: NextAction,
): InviteApiResponse {
  return {
    invited_user_id: null,
    organization_id: organizationId,
    resolved_role: null,
    invite_status: inviteStatus,
    accepted_directly: false,
    invite_sent: false,
    next_action: nextAction,
    request_id: requestId,
  };
}

function requireInviteRedirect(requestId: string) {
  const inviteRedirect = Deno.env.get('INVITE_REDIRECT_URL')?.trim() || '';
  if (!inviteRedirect) {
    return {
      redirectTo: null,
      error: errorResponse(
        requestId,
        'INVITE_REDIRECT_MISSING',
        'INVITE_REDIRECT_URL is required for invite flows.',
        500,
      ),
    };
  }

  return {
    redirectTo: inviteRedirect,
    error: null,
  };
}

async function ensureMembershipResolved(params: {
  service: ReturnType<typeof createServiceClient>;
  userId: string;
  organizationId: string;
  expectedRole: InviteRole;
  requestId: string;
}): Promise<MembershipResolutionResult> {
  const { service, userId, organizationId, expectedRole, requestId } = params;
  const { data: membership, error } = await service
    .from('organization_memberships')
    .select('role, status')
    .eq('user_id', userId)
    .eq('organization_id', organizationId)
    .maybeSingle();

  if (error || !membership) {
    return {
      ok: false,
      response: errorResponse(
        requestId,
        'MEMBERSHIP_NOT_ACTIVE',
        'User has no active membership in selected organization.',
        409,
      ),
      resolvedRole: null,
    };
  }

  if (membership.status !== 'ACTIVE') {
    return {
      ok: false,
      response: errorResponse(
        requestId,
        'MEMBERSHIP_NOT_ACTIVE',
        'User membership is not ACTIVE in selected organization.',
        409,
      ),
      resolvedRole: null,
    };
  }

  const resolvedRole = membership.role as InviteRole;
  if (resolvedRole !== expectedRole) {
    return {
      ok: false,
      response: errorResponse(
        requestId,
        'ORG_ROLE_MISMATCH',
        'Resolved membership role does not match requested role.',
        409,
        { resolved_role: resolvedRole, expected_role: expectedRole },
      ),
      resolvedRole: null,
    };
  }

  return {
    ok: true,
    response: null,
    resolvedRole,
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const requestId = buildRequestId(req);

  try {
    const { organizationId, requesterId } = await requireAdmin(req);
    const service = createServiceClient();
    console.info('[invite-technician] request.start', { requestId, method: req.method, organizationId });

    if (req.method === 'GET') {
      const { data, error } = await service
        .from('organization_invites')
        .select('*')
        .eq('organization_id', organizationId)
        .eq('status', 'PENDING')
        .order('created_at', { ascending: false });

      if (error) {
        return errorResponse(requestId, 'INTERNAL_ERROR', error.message, 400);
      }

      return jsonResponse({ invites: data ?? [], request_id: requestId });
    }

    if (req.method !== 'POST') {
      return errorResponse(requestId, 'INVALID_INPUT', 'Method not allowed', 405);
    }

    const payload = (await req.json()) as InvitePayload;
    if (payload.action === 'list_pending') {
      const { data, error } = await service
        .from('organization_invites')
        .select('*')
        .eq('organization_id', organizationId)
        .eq('status', 'PENDING')
        .order('created_at', { ascending: false });

      if (error) {
        return errorResponse(requestId, 'INTERNAL_ERROR', error.message, 400);
      }

      return jsonResponse({ invites: data ?? [], request_id: requestId });
    }

    const role: InviteRole = payload.role ?? 'TECHNICIAN';

    if (!['ADMIN', 'TECHNICIAN'].includes(role)) {
      return errorResponse(requestId, 'INVALID_INPUT', 'role must be ADMIN or TECHNICIAN', 400);
    }

    if (payload.action === 'revoke' || payload.action === 'resend') {
      const inviteId = payload.invite_id?.trim();
      if (!inviteId) {
        return errorResponse(requestId, 'INVALID_INPUT', 'invite_id is required', 400);
      }

      const { data: invite, error: inviteError } = await service
        .from('organization_invites')
        .select('*')
        .eq('id', inviteId)
        .eq('organization_id', organizationId)
        .maybeSingle();

      if (inviteError) {
        return errorResponse(requestId, 'INTERNAL_ERROR', inviteError.message, 400);
      }

      if (!invite) {
        return errorResponse(requestId, 'INVITE_NOT_FOUND', 'Invite not found', 404);
      }

      if (payload.action === 'revoke') {
        const { error } = await service
          .from('organization_invites')
          .update({ status: 'REVOKED' })
          .eq('id', inviteId)
          .eq('organization_id', organizationId);

        if (error) {
          return errorResponse(requestId, 'INTERNAL_ERROR', error.message, 400);
        }

        return successResponse({
          ...inviteResponseBase(requestId, organizationId, 'REVOKED', 'none'),
          invite_id: inviteId,
        });
      }

      const redirectConfig = requireInviteRedirect(requestId);
      if (redirectConfig.error) {
        return redirectConfig.error;
      }

      const expiresAt = new Date(Date.now() + INVITE_EXPIRY_DAYS * 24 * 60 * 60 * 1000).toISOString();
      const { error: resetError } = await service
        .from('organization_invites')
        .update({ status: 'PENDING', expires_at: expiresAt })
        .eq('id', inviteId)
        .eq('organization_id', organizationId);

      if (resetError) {
        return errorResponse(requestId, 'INTERNAL_ERROR', resetError.message, 400);
      }

      const { error: inviteError2 } = await service.auth.admin.inviteUserByEmail(invite.email, {
        data: {
          full_name: payload.full_name?.trim() || invite.email,
          role: invite.role,
          organization_id: organizationId,
        },
        redirectTo: redirectConfig.redirectTo ?? undefined,
      });

      if (inviteError2) {
        if (isAlreadyInvitedOrRegisteredError(inviteError2.message)) {
          return successResponse({
            ...inviteResponseBase(requestId, organizationId, 'PENDING', 'login'),
            invite_id: inviteId,
            resolved_role: (invite.role as InviteRole) ?? role,
            invite_sent: false,
            already_exists: true,
          });
        }

        return errorResponse(requestId, 'INTERNAL_ERROR', inviteError2.message, 400);
      }

      return successResponse({
        ...inviteResponseBase(requestId, organizationId, 'PENDING', 'login'),
        invite_id: inviteId,
        resolved_role: (invite.role as InviteRole) ?? role,
        invite_sent: true,
      });
    }

    const email = normalizeEmail(payload.email);
    const fullName = payload.full_name?.trim();

    if (!email || !fullName) {
      return errorResponse(requestId, 'INVALID_INPUT', 'email and full_name are required', 400);
    }

    const redirectConfig = requireInviteRedirect(requestId);
    if (redirectConfig.error) {
      return redirectConfig.error;
    }

    const expiresAt = new Date(Date.now() + INVITE_EXPIRY_DAYS * 24 * 60 * 60 * 1000).toISOString();

    const { data: existingAuthUser } = await service.auth.admin.listUsers({ page: 1, perPage: 1000 });
    const existingUser = existingAuthUser.users.find((candidate) => normalizeEmail(candidate.email) === email);

    if (existingUser?.id) {
      const userId = existingUser.id;
      const { error: upsertMembershipError } = await service.from('organization_memberships').upsert(
        {
          user_id: userId,
          organization_id: organizationId,
          role,
          status: 'ACTIVE',
          is_default: false,
        },
        { onConflict: 'user_id,organization_id' },
      );

      if (upsertMembershipError) {
        return errorResponse(requestId, 'INTERNAL_ERROR', upsertMembershipError.message, 400);
      }

      const { error: upsertProfileError } = await service.from('profiles').upsert(
        {
          id: userId,
          organization_id: organizationId,
          active_organization_id: organizationId,
          email,
          full_name: fullName,
          role,
          status: 'ACTIVE',
        },
        { onConflict: 'id' },
      );

      if (upsertProfileError) {
        return errorResponse(requestId, 'INTERNAL_ERROR', upsertProfileError.message, 400);
      }

      const { data: pendingInvite, error: pendingInviteError } = await service
        .from('organization_invites')
        .select('id')
        .eq('organization_id', organizationId)
        .eq('status', 'PENDING')
        .eq('email', email)
        .maybeSingle();

      if (pendingInviteError) {
        return errorResponse(requestId, 'INTERNAL_ERROR', pendingInviteError.message, 400);
      }

      const acceptedAt = new Date().toISOString();
      const { error: inviteWriteError } = pendingInvite?.id
        ? await service
            .from('organization_invites')
            .update({
              role,
              status: 'ACCEPTED',
              invited_by: requesterId,
              accepted_by: userId,
              accepted_at: acceptedAt,
              expires_at: expiresAt,
            })
            .eq('id', pendingInvite.id)
            .eq('organization_id', organizationId)
        : await service
            .from('organization_invites')
            .insert({
              organization_id: organizationId,
              email,
              role,
              status: 'ACCEPTED',
              invited_by: requesterId,
              accepted_by: userId,
              accepted_at: acceptedAt,
              expires_at: expiresAt,
            });

      if (inviteWriteError) {
        return errorResponse(requestId, 'INTERNAL_ERROR', inviteWriteError.message, 400);
      }

      const membershipCheck = await ensureMembershipResolved({
        service,
        userId,
        organizationId,
        expectedRole: role,
        requestId,
      });
      if (!membershipCheck.ok) {
        return membershipCheck.response;
      }

      return successResponse({
        ...inviteResponseBase(requestId, organizationId, 'ACCEPTED', 'login'),
        invited_user_id: userId,
        resolved_role: membershipCheck.resolvedRole,
        accepted_directly: true,
      });
    }

    const { data: pendingInvite, error: pendingInviteError } = await service
      .from('organization_invites')
      .select('id')
      .eq('organization_id', organizationId)
      .eq('status', 'PENDING')
      .eq('email', email)
      .maybeSingle();

    if (pendingInviteError) {
      return errorResponse(requestId, 'INTERNAL_ERROR', pendingInviteError.message, 400);
    }

    if (pendingInvite?.id) {
      return errorResponse(
        requestId,
        'INVITE_DUPLICATE',
        'An active invite already exists for this email in the organization.',
        409,
        { invite_id: pendingInvite.id, next_action: 'contact_admin' },
      );
    }

    const { data: inviteData, error: inviteError } = await service.auth.admin.inviteUserByEmail(email, {
      data: {
        full_name: fullName,
        role,
        organization_id: organizationId,
      },
      redirectTo: redirectConfig.redirectTo ?? undefined,
    });

    if (inviteError) {
      return errorResponse(requestId, 'INTERNAL_ERROR', inviteError.message, 400);
    }

    const invitedUserId = inviteData.user?.id;
    if (!invitedUserId) {
      return errorResponse(requestId, 'INTERNAL_ERROR', 'No invited user returned', 500);
    }

    const { count: membershipCount, error: membershipCountError } = await service
      .from('organization_memberships')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', invitedUserId);

    if (membershipCountError) {
      return errorResponse(requestId, 'INTERNAL_ERROR', membershipCountError.message, 400);
    }

    const isDefaultMembership = (membershipCount ?? 0) === 0;

    const { error: profileError } = await service.from('profiles').upsert(
      {
        id: invitedUserId,
        organization_id: organizationId,
        active_organization_id: organizationId,
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
      return errorResponse(requestId, 'INTERNAL_ERROR', profileError.message, 400);
    }

    const { error: membershipError } = await service.from('organization_memberships').upsert(
      {
        user_id: invitedUserId,
        organization_id: organizationId,
        role,
        status: 'ACTIVE',
        is_default: isDefaultMembership,
      },
      { onConflict: 'user_id,organization_id' },
    );

    if (membershipError) {
      return errorResponse(requestId, 'INTERNAL_ERROR', membershipError.message, 400);
    }

    const membershipCheck = await ensureMembershipResolved({
      service,
      userId: invitedUserId,
      organizationId,
      expectedRole: role,
      requestId,
    });
    if (!membershipCheck.ok) {
      return membershipCheck.response;
    }

    const { error: inviteRecordError } = await service.from('organization_invites').insert({
      organization_id: organizationId,
      email,
      role,
      status: 'PENDING',
      invited_by: requesterId,
      expires_at: expiresAt,
    });

    if (inviteRecordError) {
      return errorResponse(requestId, 'INTERNAL_ERROR', inviteRecordError.message, 400);
    }

    return successResponse({
      ...inviteResponseBase(requestId, organizationId, 'PENDING', 'login'),
      invited_user_id: invitedUserId,
      resolved_role: membershipCheck.resolvedRole,
      invite_sent: true,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error';
    const authDebugEnabled = Deno.env.get('AUTH_DEBUG') === 'true';
    const isAuthzError = error instanceof AuthzError;
    const code: InviteErrorCode =
      message === 'Unauthorized' || message === 'Admin privileges required' ? 'SESSION_INVALID' : 'INTERNAL_ERROR';
    const status = isAuthzError
      ? error.status
      : message === 'Unauthorized'
        ? 401
        : message === 'Admin privileges required'
          ? 403
          : message === 'No active organization selected'
            ? 400
            : 500;
    return errorResponse(requestId, code, message, status, {
      ...(authDebugEnabled && isAuthzError ? { debug: error.details ?? null } : {}),
    });
  } finally {
    console.info('[invite-technician] request.complete', { requestId });
  }
});
