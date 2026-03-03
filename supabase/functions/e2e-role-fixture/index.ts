import { AuthzError, createServiceClient, requireAdmin } from '../_shared/auth.ts';
import { corsHeaders, jsonResponse } from '../_shared/http.ts';

type FixtureErrorCode = 'FEATURE_DISABLED' | 'INVALID_INPUT' | 'UNAUTHORIZED' | 'INTERNAL_ERROR';

interface OrganizationNode {
  id?: string | null;
  name?: string | null;
}

interface MembershipNode {
  organization_id?: string | null;
  organization?: OrganizationNode | OrganizationNode[] | null;
}

function buildRequestId(req: Request) {
  return req.headers.get('x-request-id')?.trim() || crypto.randomUUID();
}

function errorResponse(requestId: string, code: FixtureErrorCode, error: string, status: number, details?: Record<string, unknown>) {
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

function resolveOrganizationName(node: MembershipNode | null | undefined) {
  if (!node) return null;
  const organization = Array.isArray(node.organization) ? node.organization[0] ?? null : node.organization ?? null;
  return organization?.name ?? null;
}

function buildFixtureAdminCredentials() {
  const token = crypto.randomUUID().replace(/-/g, '').slice(0, 10);
  return {
    email: `e2e.fixture.admin.${token}@example.com`,
    password: `Fxv!${crypto.randomUUID()}Aa1`,
    fullName: 'E2E Fixture Admin',
  };
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

    const featureEnabled = (Deno.env.get('ENABLE_E2E_ROLE_FIXTURE') ?? 'false').trim().toLowerCase() === 'true';
    if (!featureEnabled) {
      return errorResponse(requestId, 'FEATURE_DISABLED', 'E2E role fixture is disabled in this environment.', 403);
    }

    const { requesterId } = await requireAdmin(req);
    const service = createServiceClient();

    const existingTechMembership = await service
      .from('organization_memberships')
      .select('organization_id, organization:organizations(id, name)')
      .eq('user_id', requesterId)
      .eq('role', 'TECHNICIAN')
      .eq('status', 'ACTIVE')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existingTechMembership.error) {
      return errorResponse(requestId, 'INTERNAL_ERROR', existingTechMembership.error.message, 400);
    }

    const existingNode = (existingTechMembership.data ?? null) as MembershipNode | null;
    if (existingNode?.organization_id) {
      return jsonResponse({
        ok: true,
        source: 'existing',
        requester_id: requesterId,
        organization_id: existingNode.organization_id,
        organization_name: resolveOrganizationName(existingNode) ?? 'Fixture Organization',
        request_id: requestId,
      });
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
      return errorResponse(requestId, 'INTERNAL_ERROR', createdOrg.error?.message ?? 'Could not create fixture organization.', 400);
    }

    const helper = buildFixtureAdminCredentials();
    const helperAuth = await service.auth.admin.createUser({
      email: helper.email,
      password: helper.password,
      email_confirm: true,
      user_metadata: {
        full_name: helper.fullName,
        source: 'e2e-role-fixture',
      },
    });

    const helperUserId = helperAuth.data.user?.id ?? null;
    if (helperAuth.error || !helperUserId) {
      return errorResponse(
        requestId,
        'INTERNAL_ERROR',
        helperAuth.error?.message ?? 'Could not create fixture admin user.',
        400,
      );
    }

    const helperProfile = await service.from('profiles').upsert(
      {
        id: helperUserId,
        organization_id: createdOrg.data.id,
        active_organization_id: createdOrg.data.id,
        email: helper.email,
        full_name: helper.fullName,
        role: 'ADMIN',
        status: 'ACTIVE',
      },
      { onConflict: 'id' },
    );

    if (helperProfile.error) {
      return errorResponse(requestId, 'INTERNAL_ERROR', helperProfile.error.message, 400);
    }

    const helperMembership = await service.from('organization_memberships').upsert(
      {
        user_id: helperUserId,
        organization_id: createdOrg.data.id,
        role: 'ADMIN',
        status: 'ACTIVE',
        is_default: false,
      },
      { onConflict: 'user_id,organization_id' },
    );

    if (helperMembership.error) {
      return errorResponse(requestId, 'INTERNAL_ERROR', helperMembership.error.message, 400);
    }

    const requesterMembership = await service.from('organization_memberships').upsert(
      {
        user_id: requesterId,
        organization_id: createdOrg.data.id,
        role: 'TECHNICIAN',
        status: 'ACTIVE',
        is_default: false,
      },
      { onConflict: 'user_id,organization_id' },
    );

    if (requesterMembership.error) {
      return errorResponse(requestId, 'INTERNAL_ERROR', requesterMembership.error.message, 400);
    }

    return jsonResponse({
      ok: true,
      source: 'created',
      requester_id: requesterId,
      organization_id: createdOrg.data.id,
      organization_name: createdOrg.data.name,
      helper_user_id: helperUserId,
      request_id: requestId,
    });
  } catch (error) {
    if (error instanceof AuthzError) {
      const code: FixtureErrorCode =
        error.status === 401 || error.status === 403
          ? 'UNAUTHORIZED'
          : error.status === 400
            ? 'INVALID_INPUT'
            : 'INTERNAL_ERROR';
      return errorResponse(requestId, code, error.message, error.status, error.details);
    }

    const message = error instanceof Error ? error.message : 'Unexpected error';
    return errorResponse(requestId, 'INTERNAL_ERROR', message, 500);
  }
});
