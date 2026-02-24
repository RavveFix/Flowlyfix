export interface MockFortnoxCustomer {
  external_id: string;
  name: string;
  status: 'UPDATED' | 'CREATED';
}

export async function syncCustomersMock(): Promise<MockFortnoxCustomer[]> {
  await new Promise((resolve) => setTimeout(resolve, 250));
  return [
    { external_id: '1001', name: 'Acme Corp', status: 'UPDATED' },
    { external_id: '1002', name: 'Wayne Enterprises', status: 'CREATED' },
  ];
}
