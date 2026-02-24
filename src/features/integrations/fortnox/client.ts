import { syncCustomersMock, type MockFortnoxCustomer } from '@/sandbox/integrations/fortnox/syncCustomersMock';

export async function syncCustomers(): Promise<MockFortnoxCustomer[]> {
  return syncCustomersMock();
}
