export interface Customer {
  id: string;
  organization_id: string;
  name: string;
  org_number?: string | null;
  external_fortnox_id?: string | null;
  address: string;
  contact_person?: string | null;
  contact_phone?: string | null;
  contact_email?: string | null;
  created_at: string;
  updated_at: string;
}

export interface CustomerSite {
  id: string;
  organization_id: string;
  customer_id: string;
  name: string;
  address: string;
  contact_person?: string | null;
  contact_phone?: string | null;
  created_at: string;
  updated_at: string;
}

export interface Asset {
  id: string;
  organization_id: string;
  customer_id: string;
  customer_site_id?: string | null;
  name: string;
  serial_number: string;
  model: string;
  location_in_building?: string | null;
  qr_code_id?: string | null;
  install_date?: string | null;
  created_at: string;
  updated_at: string;
}

export interface InventoryItem {
  id: string;
  organization_id: string;
  sku: string;
  name: string;
  stock_qty: number;
  unit_cost: number;
  created_at: string;
  updated_at: string;
}

export interface CsvImportRow {
  customer_name: string;
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

export interface CsvImportResult {
  created: number;
  updated: number;
  skipped: number;
  dry_run: boolean;
  failed: Array<{ row: number; error: string }>;
  row_results: Array<{
    row: number;
    action: 'created' | 'updated' | 'skipped' | 'failed';
    message: string;
    customer_name?: string;
    asset_serial_number?: string;
  }>;
  summary: {
    customers_created: number;
    customers_updated: number;
    assets_created: number;
    assets_updated: number;
    rows_processed: number;
    rows_skipped: number;
  };
}
