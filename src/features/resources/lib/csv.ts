import { CsvImportRow } from '@/shared/types';

export const CSV_IMPORT_HEADERS = [
  'customer_name',
  'customer_org_number',
  'customer_address',
  'contact_person',
  'contact_phone',
  'contact_email',
  'asset_name',
  'asset_model',
  'asset_serial_number',
  'asset_location',
] as const;

export const REQUIRED_CSV_IMPORT_HEADERS = ['customer_name'] as const;

export interface ParsedCsvImport {
  rows: CsvImportRow[];
  headers: string[];
  missingRequiredHeaders: string[];
}

const HEADER_ALIASES: Record<string, string> = {
  kundnamn: 'customer_name',
  kund_namn: 'customer_name',
  customer: 'customer_name',
  organisationsnummer: 'customer_org_number',
  organisationnummer: 'customer_org_number',
  orgnummer: 'customer_org_number',
  org_nummer: 'customer_org_number',
  orgnr: 'customer_org_number',
  adress: 'customer_address',
  address: 'customer_address',
  kontaktperson: 'contact_person',
  kontakt_person: 'contact_person',
  telefon: 'contact_phone',
  phone: 'contact_phone',
  epost: 'contact_email',
  e_post: 'contact_email',
  email: 'contact_email',
  maskin: 'asset_name',
  maskinnamn: 'asset_name',
  tillgang: 'asset_name',
  tillgang_namn: 'asset_name',
  modell: 'asset_model',
  model: 'asset_model',
  serienummer: 'asset_serial_number',
  serialnumber: 'asset_serial_number',
  serial_number: 'asset_serial_number',
  serial: 'asset_serial_number',
  plats: 'asset_location',
  location: 'asset_location',
};

function normalizeHeader(header: string): string {
  return header
    .replace(/^\uFEFF/, '')
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w\s-]/g, '')
    .replace(/[-\s]+/g, '_')
    .replace(/_+/g, '_');
}

function toCanonicalHeader(header: string): string {
  if ((CSV_IMPORT_HEADERS as readonly string[]).includes(header)) {
    return header;
  }
  return HEADER_ALIASES[header] ?? header;
}

function detectDelimiter(headerLine: string): string {
  const delimiters = [',', ';', '\t'] as const;
  let best = ',';
  let bestCount = -1;

  for (const delimiter of delimiters) {
    const count = headerLine.split(delimiter).length - 1;
    if (count > bestCount) {
      best = delimiter;
      bestCount = count;
    }
  }

  return best;
}

export function parseCsvImport(content: string): ParsedCsvImport {
  const lines = content
    .split(/\r\n|\n|\r/)
    .filter((line) => line.trim().length > 0);

  if (lines.length === 0) {
    return { rows: [], headers: [], missingRequiredHeaders: [...REQUIRED_CSV_IMPORT_HEADERS] };
  }

  const delimiter = detectDelimiter(lines[0]);
  const headers = splitCsvLine(lines[0], delimiter).map((header) => toCanonicalHeader(normalizeHeader(header)));
  const missingRequiredHeaders = REQUIRED_CSV_IMPORT_HEADERS.filter((requiredHeader) => !headers.includes(requiredHeader));

  if (lines.length === 1) {
    return { rows: [], headers, missingRequiredHeaders };
  }

  const rows: CsvImportRow[] = [];

  for (let i = 1; i < lines.length; i += 1) {
    const values = splitCsvLine(lines[i], delimiter);
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

  return { rows, headers, missingRequiredHeaders };
}

export function parseCsvRows(content: string): CsvImportRow[] {
  return parseCsvImport(content).rows;
}

function splitCsvLine(line: string, delimiter = ','): string[] {
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

    if (ch === delimiter && !inQuotes) {
      result.push(current);
      current = '';
      continue;
    }

    current += ch;
  }

  result.push(current);
  return result;
}
