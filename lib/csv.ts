import { CsvImportRow } from '../types';

function normalizeHeader(header: string): string {
  return header.trim().toLowerCase().replace(/\s+/g, '_');
}

export function parseCsvRows(content: string): CsvImportRow[] {
  const lines = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length <= 1) {
    return [];
  }

  const headers = lines[0].split(',').map(normalizeHeader);
  const rows: CsvImportRow[] = [];

  for (let i = 1; i < lines.length; i += 1) {
    const values = splitCsvLine(lines[i]);
    const row: Record<string, string> = {};

    headers.forEach((header, idx) => {
      row[header] = (values[idx] ?? '').trim();
    });

    rows.push({
      customer_name: row.customer_name,
      customer_org_number: row.customer_org_number,
      customer_address: row.customer_address,
      contact_person: row.contact_person,
      contact_phone: row.contact_phone,
      contact_email: row.contact_email,
      asset_name: row.asset_name,
      asset_model: row.asset_model,
      asset_serial_number: row.asset_serial_number,
      asset_location: row.asset_location,
    });
  }

  return rows;
}

function splitCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];

    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (ch === ',' && !inQuotes) {
      result.push(current);
      current = '';
      continue;
    }

    current += ch;
  }

  result.push(current);
  return result;
}
