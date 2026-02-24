import { corsHeaders, jsonResponse } from '../_shared/http.ts';
import { createServiceClient, requireAdmin } from '../_shared/auth.ts';

interface ImportRow {
  customer_name?: string;
  customer_org_number?: string;
  customer_address?: string;
  contact_person?: string;
  contact_phone?: string;
  contact_email?: string;
  asset_name?: string;
  asset_model?: string;
  asset_serial_number?: string;
  asset_location?: string;
}

interface ImportPayload {
  rows?: ImportRow[];
  dry_run?: boolean;
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
    const payload = (await req.json()) as ImportPayload;
    const rows = payload.rows ?? [];
    const dryRun = payload.dry_run ?? false;

    if (!Array.isArray(rows) || rows.length === 0) {
      return jsonResponse({ error: 'rows is required and must contain at least one row' }, 400);
    }

    const failed: Array<{ row: number; error: string }> = [];
    let created = 0;
    let updated = 0;

    const service = createServiceClient();

    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index];

      const customerName = row.customer_name?.trim();
      const customerOrgNumber = row.customer_org_number?.trim() || null;
      const customerAddress = row.customer_address?.trim() || '';
      const contactPerson = row.contact_person?.trim() || null;
      const contactPhone = row.contact_phone?.trim() || null;
      const contactEmail = row.contact_email?.trim() || null;
      const assetName = row.asset_name?.trim() || null;
      const assetModel = row.asset_model?.trim() || null;
      const assetSerial = row.asset_serial_number?.trim() || null;
      const assetLocation = row.asset_location?.trim() || null;

      if (!customerName) {
        failed.push({ row: index + 1, error: 'customer_name is required' });
        continue;
      }

      if (dryRun) {
        continue;
      }

      try {
        let customerId: string | null = null;
        let customerWasCreated = false;

        if (customerOrgNumber) {
          const { data: byOrgNo, error: byOrgNoError } = await service
            .from('customers')
            .select('id')
            .eq('organization_id', organizationId)
            .eq('org_number', customerOrgNumber)
            .maybeSingle();

          if (byOrgNoError) {
            throw new Error(byOrgNoError.message);
          }

          customerId = byOrgNo?.id ?? null;
        }

        if (!customerId) {
          const { data: byName, error: byNameError } = await service
            .from('customers')
            .select('id')
            .eq('organization_id', organizationId)
            .ilike('name', customerName)
            .maybeSingle();

          if (byNameError) {
            throw new Error(byNameError.message);
          }

          customerId = byName?.id ?? null;
        }

        if (customerId) {
          const { error: updateCustomerError } = await service
            .from('customers')
            .update({
              name: customerName,
              org_number: customerOrgNumber,
              address: customerAddress,
              contact_person: contactPerson,
              contact_phone: contactPhone,
              contact_email: contactEmail,
            })
            .eq('id', customerId)
            .eq('organization_id', organizationId);

          if (updateCustomerError) {
            throw new Error(updateCustomerError.message);
          }

          updated += 1;
        } else {
          const { data: insertedCustomer, error: insertCustomerError } = await service
            .from('customers')
            .insert({
              organization_id: organizationId,
              name: customerName,
              org_number: customerOrgNumber,
              address: customerAddress,
              contact_person: contactPerson,
              contact_phone: contactPhone,
              contact_email: contactEmail,
            })
            .select('id')
            .single();

          if (insertCustomerError || !insertedCustomer) {
            throw new Error(insertCustomerError?.message ?? 'Failed to insert customer');
          }

          customerId = insertedCustomer.id;
          customerWasCreated = true;
          created += 1;
        }

        if (assetSerial && assetModel) {
          const { data: existingAsset, error: assetLookupError } = await service
            .from('assets')
            .select('id')
            .eq('organization_id', organizationId)
            .ilike('serial_number', assetSerial)
            .maybeSingle();

          if (assetLookupError) {
            throw new Error(assetLookupError.message);
          }

          if (existingAsset?.id) {
            const { error: updateAssetError } = await service
              .from('assets')
              .update({
                customer_id: customerId,
                name: assetName || assetModel,
                model: assetModel,
                serial_number: assetSerial,
                location_in_building: assetLocation,
              })
              .eq('id', existingAsset.id)
              .eq('organization_id', organizationId);

            if (updateAssetError) {
              throw new Error(updateAssetError.message);
            }

            if (!customerWasCreated) {
              updated += 1;
            }
          } else {
            const { error: insertAssetError } = await service.from('assets').insert({
              organization_id: organizationId,
              customer_id: customerId,
              name: assetName || assetModel,
              model: assetModel,
              serial_number: assetSerial,
              location_in_building: assetLocation,
            });

            if (insertAssetError) {
              throw new Error(insertAssetError.message);
            }

            created += 1;
          }
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        failed.push({ row: index + 1, error: message });
      }
    }

    return jsonResponse({ created, updated, failed });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error';
    const status = message === 'Unauthorized' ? 401 : message === 'Admin privileges required' ? 403 : 500;
    return jsonResponse({ error: message }, status);
  }
});
