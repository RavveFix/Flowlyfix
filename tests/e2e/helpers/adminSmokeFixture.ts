import { createClient, SupabaseClient } from '@supabase/supabase-js';

interface AdminSmokeAuthContext {
  client: SupabaseClient;
  organizationId: string;
  profileId: string;
  profileName: string;
}

interface FixtureCustomer {
  id: string;
  name: string;
}

export interface AdminSmokeWorkshopFixture {
  workOrderId: string;
  description: string;
  customerName: string;
}

export interface AdminSmokeReadyBillingFixture {
  workOrderId: string;
  description: string;
  customerName: string;
}

function readRequiredEnv(key: string) {
  const value = process.env[key]?.trim() ?? '';
  if (!value) {
    throw new Error(`Missing required env var for admin smoke fixture: ${key}`);
  }
  return value;
}

function fixtureToken(prefix: string) {
  const random = Math.random().toString(36).slice(2, 8);
  return `${prefix}-${Date.now()}-${random}`;
}

async function resolveAuthContext(): Promise<AdminSmokeAuthContext> {
  const supabaseUrl = readRequiredEnv('VITE_SUPABASE_URL');
  const anonKey = readRequiredEnv('VITE_SUPABASE_ANON_KEY');
  const email = readRequiredEnv('E2E_ADMIN_EMAIL');
  const password = readRequiredEnv('E2E_ADMIN_PASSWORD');

  const client = createClient(supabaseUrl, anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  const signInRes = await client.auth.signInWithPassword({ email, password });
  if (signInRes.error || !signInRes.data.user?.id) {
    throw new Error(`Admin smoke fixture sign-in failed: ${signInRes.error?.message ?? 'no user returned'}`);
  }

  const userId = signInRes.data.user.id;
  const profileRes = await client
    .from('profiles')
    .select('id, full_name, organization_id, active_organization_id')
    .eq('id', userId)
    .maybeSingle();

  if (profileRes.error || !profileRes.data) {
    throw new Error(`Admin smoke fixture profile lookup failed: ${profileRes.error?.message ?? 'profile missing'}`);
  }

  const profile = profileRes.data as {
    id?: string | null;
    full_name?: string | null;
    organization_id?: string | null;
    active_organization_id?: string | null;
  };

  const organizationId = profile.active_organization_id ?? profile.organization_id ?? '';
  const profileId = profile.id ?? '';
  if (!organizationId || !profileId) {
    throw new Error('Admin smoke fixture could not resolve profile organization context.');
  }

  return {
    client,
    organizationId,
    profileId,
    profileName: profile.full_name?.trim() || email,
  };
}

async function withAdminContext<T>(run: (context: AdminSmokeAuthContext) => Promise<T>): Promise<T> {
  const context = await resolveAuthContext();
  try {
    return await run(context);
  } finally {
    await context.client.auth.signOut();
  }
}

async function ensureCustomer(context: AdminSmokeAuthContext): Promise<FixtureCustomer> {
  const existing = await context.client
    .from('customers')
    .select('id, name')
    .eq('organization_id', context.organizationId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing.error) {
    throw new Error(`Admin smoke fixture failed to read customers: ${existing.error.message}`);
  }

  if (existing.data?.id && existing.data.name) {
    return {
      id: existing.data.id as string,
      name: existing.data.name as string,
    };
  }

  const customerName = `E2E Smoke Customer ${Date.now()}`;
  const created = await context.client
    .from('customers')
    .insert({
      organization_id: context.organizationId,
      name: customerName,
      address: 'Smoke Testgatan 1',
      contact_person: 'Smoke Contact',
      contact_phone: '+46 70 000 00 00',
    })
    .select('id, name')
    .single();

  if (created.error || !created.data?.id || !created.data.name) {
    throw new Error(`Admin smoke fixture failed to create customer: ${created.error?.message ?? 'insert failed'}`);
  }

  return {
    id: created.data.id as string,
    name: created.data.name as string,
  };
}

export async function ensureAdminSmokeWorkshopFixture(): Promise<AdminSmokeWorkshopFixture> {
  return withAdminContext(async (context) => {
    const customer = await ensureCustomer(context);
    const token = fixtureToken('ws');
    const description = `E2E workshop ${token}`;
    const nowIso = new Date().toISOString();

    const inserted = await context.client
      .from('work_orders')
      .insert({
        organization_id: context.organizationId,
        customer_id: customer.id,
        job_type: 'WORKSHOP',
        status: 'WORKSHOP_RECEIVED',
        priority: 'NORMAL',
        title: `E2E Workshop ${token}`,
        description,
        scheduled_start: nowIso,
      })
      .select('id')
      .single();

    if (inserted.error || !inserted.data?.id) {
      throw new Error(`Admin smoke fixture failed to create workshop job: ${inserted.error?.message ?? 'insert failed'}`);
    }

    return {
      workOrderId: inserted.data.id as string,
      description,
      customerName: customer.name,
    };
  });
}

export async function ensureAdminSmokeReadyBillingFixture(): Promise<AdminSmokeReadyBillingFixture> {
  return withAdminContext(async (context) => {
    const customer = await ensureCustomer(context);
    const token = fixtureToken('billing');
    const description = `E2E billing ${token}`;
    const nowIso = new Date().toISOString();

    const workOrderRes = await context.client
      .from('work_orders')
      .insert({
        organization_id: context.organizationId,
        customer_id: customer.id,
        job_type: 'FIELD',
        status: 'DONE',
        billing_status: 'READY',
        priority: 'NORMAL',
        title: `E2E Billing ${token}`,
        description,
        scheduled_start: nowIso,
        completed_at: nowIso,
        technician_report: `E2E billing report ${token}`,
        technician_signed_by: context.profileId,
        technician_signed_name: context.profileName,
        technician_signed_at: nowIso,
        billing_ready_at: nowIso,
      })
      .select('id')
      .single();

    if (workOrderRes.error || !workOrderRes.data?.id) {
      throw new Error(`Admin smoke fixture failed to create billing work order: ${workOrderRes.error?.message ?? 'insert failed'}`);
    }

    const workOrderId = workOrderRes.data.id as string;

    const workLogRes = await context.client.from('work_logs').insert({
      organization_id: context.organizationId,
      work_order_id: workOrderId,
      technician_id: context.profileId,
      description: `E2E work log ${token}`,
      minutes: 45,
    });
    if (workLogRes.error) {
      throw new Error(`Admin smoke fixture failed to create work log: ${workLogRes.error.message}`);
    }

    const partRes = await context.client.from('work_order_parts').insert({
      organization_id: context.organizationId,
      work_order_id: workOrderId,
      part_name: `E2E part ${token}`,
      qty: 1,
      unit_cost: 199,
      total_cost: 199,
    });
    if (partRes.error) {
      throw new Error(`Admin smoke fixture failed to create part row: ${partRes.error.message}`);
    }

    return {
      workOrderId,
      description,
      customerName: customer.name,
    };
  });
}
