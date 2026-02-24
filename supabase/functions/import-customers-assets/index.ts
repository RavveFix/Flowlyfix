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

interface CustomerRecord {
  id: string;
  name: string;
  org_number: string | null;
  address: string;
  contact_person: string | null;
  contact_phone: string | null;
  contact_email: string | null;
}

interface AssetRecord {
  id: string;
  customer_id: string;
  name: string;
  model: string;
  serial_number: string;
  location_in_building: string | null;
}

type RowAction = 'created' | 'updated' | 'skipped' | 'failed';

interface RowResult {
  row: number;
  action: RowAction;
  message: string;
  customer_name?: string;
  asset_serial_number?: string;
}

interface ImportSummary {
  customers_created: number;
  customers_updated: number;
  assets_created: number;
  assets_updated: number;
  rows_processed: number;
  rows_skipped: number;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeText(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : null;
}

function hasAssetFields(row: ImportRow) {
  return Boolean(
    normalizeText(row.asset_name) ||
      normalizeText(row.asset_model) ||
      normalizeText(row.asset_serial_number) ||
      normalizeText(row.asset_location),
  );
}

function equalsNullable(a?: string | null, b?: string | null) {
  return normalizeText(a) === normalizeText(b);
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

    if (rows.length > 2000) {
      return jsonResponse({ error: 'Maximum 2000 rows per import' }, 400);
    }

    const failed: Array<{ row: number; error: string }> = [];
    const rowResults: RowResult[] = [];
    let created = 0;
    let updated = 0;
    let skipped = 0;
    const summary: ImportSummary = {
      customers_created: 0,
      customers_updated: 0,
      assets_created: 0,
      assets_updated: 0,
      rows_processed: 0,
      rows_skipped: 0,
    };

    const service = createServiceClient();

    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index];
      const rowNumber = index + 1;

      const customerName = normalizeText(row.customer_name);
      const customerOrgNumber = normalizeText(row.customer_org_number);
      const customerAddress = normalizeText(row.customer_address) ?? '';
      const contactPerson = normalizeText(row.contact_person);
      const contactPhone = normalizeText(row.contact_phone);
      const contactEmail = normalizeText(row.contact_email);
      const assetName = normalizeText(row.asset_name);
      const assetModel = normalizeText(row.asset_model);
      const assetSerial = normalizeText(row.asset_serial_number);
      const assetLocation = normalizeText(row.asset_location);
      const rowHasAssetData = hasAssetFields(row);

      if (!customerName) {
        const errorMessage = 'customer_name is required';
        failed.push({ row: rowNumber, error: errorMessage });
        rowResults.push({
          row: rowNumber,
          action: 'failed',
          message: errorMessage,
          customer_name: customerName ?? undefined,
          asset_serial_number: assetSerial ?? undefined,
        });
        continue;
      }

      if (contactEmail && !EMAIL_REGEX.test(contactEmail)) {
        const errorMessage = 'contact_email is invalid';
        failed.push({ row: rowNumber, error: errorMessage });
        rowResults.push({
          row: rowNumber,
          action: 'failed',
          message: errorMessage,
          customer_name: customerName,
          asset_serial_number: assetSerial ?? undefined,
        });
        continue;
      }

      if (rowHasAssetData && (!assetModel || !assetSerial)) {
        const errorMessage = 'asset_model and asset_serial_number are both required when importing an asset';
        failed.push({ row: rowNumber, error: errorMessage });
        rowResults.push({
          row: rowNumber,
          action: 'failed',
          message: errorMessage,
          customer_name: customerName,
          asset_serial_number: assetSerial ?? undefined,
        });
        continue;
      }

      try {
        let customerId: string;
        let customerAction: Exclude<RowAction, 'failed'> = 'skipped';
        let assetAction: Exclude<RowAction, 'failed'> | null = null;
        const rowMessages: string[] = [];
        let existingCustomer: CustomerRecord | null = null;

        if (customerOrgNumber) {
          const { data: byOrgNo, error: byOrgNoError } = await service
            .from('customers')
            .select('id, name, org_number, address, contact_person, contact_phone, contact_email')
            .eq('organization_id', organizationId)
            .eq('org_number', customerOrgNumber)
            .limit(1)
            .maybeSingle();

          if (byOrgNoError) {
            throw new Error(byOrgNoError.message);
          }

          existingCustomer = (byOrgNo as CustomerRecord | null) ?? null;
        }

        if (!existingCustomer) {
          const { data: byName, error: byNameError } = await service
            .from('customers')
            .select('id, name, org_number, address, contact_person, contact_phone, contact_email')
            .eq('organization_id', organizationId)
            .ilike('name', customerName)
            .limit(1)
            .maybeSingle();

          if (byNameError) {
            throw new Error(byNameError.message);
          }

          existingCustomer = (byName as CustomerRecord | null) ?? null;
        }

        if (existingCustomer?.id) {
          const customerUpdates = {
            name: customerName,
            org_number: customerOrgNumber,
            address: customerAddress,
            contact_person: contactPerson,
            contact_phone: contactPhone,
            contact_email: contactEmail,
          };

          const customerChanged =
            existingCustomer.name !== customerUpdates.name ||
            !equalsNullable(existingCustomer.org_number, customerUpdates.org_number) ||
            existingCustomer.address !== customerUpdates.address ||
            !equalsNullable(existingCustomer.contact_person, customerUpdates.contact_person) ||
            !equalsNullable(existingCustomer.contact_phone, customerUpdates.contact_phone) ||
            !equalsNullable(existingCustomer.contact_email, customerUpdates.contact_email);

          if (customerChanged) {
            if (!dryRun) {
              const { error: updateCustomerError } = await service
                .from('customers')
                .update(customerUpdates)
                .eq('id', existingCustomer.id)
                .eq('organization_id', organizationId);

              if (updateCustomerError) {
                throw new Error(updateCustomerError.message);
              }
            }

            updated += 1;
            summary.customers_updated += 1;
            customerAction = 'updated';
            rowMessages.push(dryRun ? 'Customer would be updated' : 'Customer updated');
          } else {
            customerAction = 'skipped';
            rowMessages.push('Customer unchanged');
          }

          customerId = existingCustomer.id;
        } else {
          if (!dryRun) {
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
          } else {
            customerId = `dry-run-customer-${rowNumber}`;
          }

          created += 1;
          summary.customers_created += 1;
          customerAction = 'created';
          rowMessages.push(dryRun ? 'Customer would be created' : 'Customer created');
        }

        if (rowHasAssetData && assetSerial && assetModel) {
          const { data: existingAsset, error: assetLookupError } = await service
            .from('assets')
            .select('id, customer_id, name, model, serial_number, location_in_building')
            .eq('organization_id', organizationId)
            .ilike('serial_number', assetSerial)
            .limit(1)
            .maybeSingle();

          if (assetLookupError) {
            throw new Error(assetLookupError.message);
          }

          const existing = (existingAsset as AssetRecord | null) ?? null;

          if (existing?.id) {
            const assetUpdates = {
              customer_id: customerId,
              name: assetName || assetModel,
              model: assetModel,
              serial_number: assetSerial,
              location_in_building: assetLocation,
            };

            const assetChanged =
              existing.customer_id !== assetUpdates.customer_id ||
              existing.name !== assetUpdates.name ||
              existing.model !== assetUpdates.model ||
              existing.serial_number !== assetUpdates.serial_number ||
              !equalsNullable(existing.location_in_building, assetUpdates.location_in_building);

            if (assetChanged) {
              if (!dryRun) {
                const { error: updateAssetError } = await service
                  .from('assets')
                  .update(assetUpdates)
                  .eq('id', existing.id)
                  .eq('organization_id', organizationId);

                if (updateAssetError) {
                  throw new Error(updateAssetError.message);
                }
              }

              updated += 1;
              summary.assets_updated += 1;
              assetAction = 'updated';
              rowMessages.push(dryRun ? 'Asset would be updated' : 'Asset updated');
            } else {
              assetAction = 'skipped';
              rowMessages.push('Asset unchanged');
            }
          } else {
            if (!dryRun) {
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
            }

            created += 1;
            summary.assets_created += 1;
            assetAction = 'created';
            rowMessages.push(dryRun ? 'Asset would be created' : 'Asset created');
          }
        }

        let finalAction: Exclude<RowAction, 'failed'> = 'skipped';
        if (customerAction === 'created' || assetAction === 'created') {
          finalAction = 'created';
        } else if (customerAction === 'updated' || assetAction === 'updated') {
          finalAction = 'updated';
        }

        if (finalAction === 'skipped') {
          skipped += 1;
          summary.rows_skipped += 1;
          if (rowMessages.length === 0) {
            rowMessages.push('No changes detected');
          }
        }

        summary.rows_processed += 1;
        rowResults.push({
          row: rowNumber,
          action: finalAction,
          message: rowMessages.join(' • '),
          customer_name: customerName,
          asset_serial_number: assetSerial ?? undefined,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        failed.push({ row: rowNumber, error: message });
        rowResults.push({
          row: rowNumber,
          action: 'failed',
          message,
          customer_name: customerName,
          asset_serial_number: assetSerial ?? undefined,
        });
      }
    }

    return jsonResponse({
      dry_run: dryRun,
      created,
      updated,
      skipped,
      failed,
      row_results: rowResults,
      summary,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error';
    const status = message === 'Unauthorized' ? 401 : message === 'Admin privileges required' ? 403 : 500;
    return jsonResponse({ error: message }, status);
  }
});
