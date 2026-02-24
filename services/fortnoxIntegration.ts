// DELIVERABLE 5: Fortnox Integration Plan

/**
 * HIGH-LEVEL EXPLANATION: Fortnox API Sync Logic
 * 
 * 1. ARCHITECTURE:
 *    - We utilize a "Sync Engine" running as a scheduled cron job (e.g., via Inngest or Vercel Cron)
 *    - Uses OAuth2 flow to authenticate `Docuraft` with the tenant's Fortnox account.
 * 
 * 2. CUSTOMER SYNC (Fortnox -> Docuraft):
 *    - Endpoint: GET https://api.fortnox.se/3/customers
 *    - Strategy: Upsert (Update if exists, Insert if new) based on `CustomerNumber`.
 *    - Code Flow:
 *      a. Fetch all modified customers from Fortnox since `last_synced_at`.
 *      b. Map Fortnox fields (Name, Address, Email) to Docuraft `customers` table.
 *      c. Store `CustomerNumber` as `external_fortnox_id`.
 * 
 * 3. INVOICE DRAFT (Docuraft -> Fortnox):
 *    - Trigger: When `WorkOrder.status` changes to `DONE`.
 *    - Endpoint: POST https://api.fortnox.se/3/invoices
 *    - Payload Construction:
 *      - CustomerNumber: `customer.external_fortnox_id`
 *      - InvoiceRows: Map `work_logs` items.
 *          - Labor: Mapped to a specific ArticleNumber (e.g., "SERVICE-HOUR").
 *          - Materials: Mapped via SKU.
 *    - Result: Creates a DRAFT invoice in Fortnox for the finance team to approve.
 * 
 * 4. ERROR HANDLING:
 *    - If Sync fails, we flag the `Customer` or `WorkOrder` with `sync_status: 'ERROR'` 
 *    - Errors are logged to Sentry.
 */

export const syncCustomersMock = async () => {
    console.log("Fortnox Sync: Starting batch...");
    // Mock logic simulating the fetch
    return [
        { external_id: '1001', name: 'Acme Corp', status: 'UPDATED' },
        { external_id: '1002', name: 'Wayne Enterprises', status: 'CREATED' }
    ];
}