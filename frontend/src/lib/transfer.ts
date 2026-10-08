/**
 * SheetJS is ~440 kB, so it is fetched on demand rather than shipped with the
 * first paint — a visitor who never touches Export never downloads it.
 */
let XLSX: typeof import('xlsx') | null = null;
const sheetjs = async () => (XLSX ??= await import('xlsx'));

/**
 * Everything that turns a table into a spreadsheet and back.
 *
 * One library handles both formats: SheetJS parses CSV *and* XLSX the same
 * way and serialises them the same way, so there is a single code path for
 * "read what the user uploaded" and one for "hand them a file".
 *
 * The column spec below is the contract shared by export, the import parser
 * and the in-app help: the header row is always the canonical field name, and
 * the human label is accepted as an alias so a hand-made file still maps.
 */

export type ColumnKind = 'text' | 'int' | 'date' | 'datetime' | 'enum' | 'id';

export type TransferColumn = {
  /** Export header and the field name the backend expects. */
  key: string;
  /** Human wording — used in the guide sheet and accepted as an import alias. */
  label: string;
  required?: boolean;
  kind: ColumnKind;
  /** Allowed values for `enum` columns. */
  values?: string[];
  /** Realistic value shown in the guide / template. */
  example?: string;
  note?: string;
  get: (row: any) => unknown;
};

const pad = (n: number) => String(n).padStart(2, '0');

export const ymd = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** `2026-10-10 19:00` — the wall-clock time the user picked, in their zone. */
export const localStamp = (d: Date) => `${ymd(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;

const KIND_LABEL: Record<ColumnKind, string> = {
  text: 'text',
  int: 'whole number',
  date: 'date — YYYY-MM-DD',
  datetime: 'date & time — YYYY-MM-DD HH:mm',
  enum: 'one of the listed values',
  id: 'existing id (leave blank to create)',
};

// ------------------------------------------------------------------ export

function asDate(v: unknown): Date | null {
  if (v instanceof Date) return v;
  const d = new Date(String(v));
  return isNaN(d.getTime()) ? null : d;
}

/** Cell value as it should appear in a spreadsheet. */
function exportCell(v: unknown, col: TransferColumn): string | number {
  if (v === null || v === undefined) return '';
  const s = String(v).trim();
  if (s === '') return '';

  if (col.kind === 'date') {
    const iso = s.match(/^(\d{4}-\d{2}-\d{2})/);
    if (iso) return iso[1];
    const d = asDate(v);
    return d ? ymd(d) : s;
  }
  if (col.kind === 'datetime') {
    const d = asDate(v);
    return d ? localStamp(d) : s;
  }
  if (col.kind === 'int') {
    const n = Number(v);
    return Number.isFinite(n) ? n : s;
  }
  return s;
}

const headerRow = (columns: TransferColumn[]) => columns.map((c) => c.key);

const dataRows = (columns: TransferColumn[], rows: any[]) =>
  rows.map((r) => columns.map((c) => exportCell(c.get(r), c)));

const guideRows = (columns: TransferColumn[]) => [
  ['column', 'description', 'type', 'required', 'values / example', 'notes'],
  ...columns.map((c) => [
    c.key,
    c.label,
    KIND_LABEL[c.kind],
    c.required ? 'YES' : 'no',
    c.values ? c.values.join('  |  ') : c.example ?? '',
    c.note ?? '',
  ]),
];

const download = (filename: string, blob: Blob) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

const stamp = () => ymd(new Date());

/** CSV — UTF-8 BOM so Excel opens accented characters correctly. */
export async function downloadCsv(base: string, columns: TransferColumn[], rows: any[]) {
  const { utils } = await sheetjs();
  const ws = utils.aoa_to_sheet([headerRow(columns), ...dataRows(columns, rows)]);
  const csv = utils.sheet_to_csv(ws);
  download(
    `${base}-${stamp()}.csv`,
    new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' }),
  );
}

/** Two sheets: `Data` (what you edit) and `Guide` (what each column means). */
export async function downloadXlsx(
  base: string,
  columns: TransferColumn[],
  rows: any[],
  template = false,
) {
  const { utils, write } = await sheetjs();
  const wb = utils.book_new();
  utils.book_append_sheet(
    wb,
    utils.aoa_to_sheet([headerRow(columns), ...dataRows(columns, rows)]),
    'Data',
  );
  utils.book_append_sheet(wb, utils.aoa_to_sheet(guideRows(columns)), 'Guide');
  const out = write(wb, { bookType: 'xlsx', type: 'array' });
  download(
    `${base}-${template ? 'template-' : ''}${stamp()}.xlsx`,
    new Blob([out], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }),
  );
}

// ------------------------------------------------------------------ import

/** Header matching is forgiving about case, spacing and punctuation. */
export const normHeader = (s: unknown) =>
  String(s ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

function fromSerial(n: number, kind: ColumnKind): string {
  const d = new Date(Math.round((n - 25569) * 86400000));
  if (kind === 'date')
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  return d.toISOString();
}

/**
 * `2026-10-10`, `10/31/2026`, `31.10.2026` → [year, month, day].
 * Ambiguous day/month pairs default to month-first (Excel's usual locale);
 * only a part greater than 12 disambiguates. Null when nothing matched.
 */
function dayMonthYear(s: string): [number, number, number] | null {
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return [+m[1], +m[2], +m[3]];

  m = s.match(/^(\d{1,2})[/.](\d{1,2})[/.](\d{4})/);
  if (m) {
    const a = +m[1];
    const b = +m[2];
    const [month, day] = a > 12 ? [b, a] : [a, b];
    return [+m[3], month, day];
  }
  return null;
}

function parseDateCell(s: string): string {
  const dmy = dayMonthYear(s);
  if (dmy) return `${dmy[0]}-${pad(dmy[1])}-${pad(dmy[2])}`;
  const d = asDate(s);
  return d ? ymd(d) : s;
}

function parseStampCell(s: string): string {
  // An explicit offset or Z denotes an instant — keep it exactly as written.
  if (/[zZ]$|[+-]\d{2}:?\d{2}$/.test(s)) {
    const d = asDate(s);
    if (d) return d.toISOString();
  }
  const time = s.match(/(\d{1,2}):(\d{2})(?::\d{2})?/);
  const dmy = dayMonthYear(s);
  if (dmy)
    return new Date(dmy[0], dmy[1] - 1, dmy[2], time ? +time[1] : 0, time ? +time[2] : 0)
      .toISOString();
  const d = asDate(s);
  return d ? d.toISOString() : s;
}

function importCell(v: unknown, col: TransferColumn): unknown {
  if (v === null || v === undefined) return '';

  if (v instanceof Date) {
    if (col.kind === 'date') return ymd(v);
    if (col.kind === 'datetime') return v.toISOString();
    return v;
  }

  if (typeof v === 'number') {
    if (col.kind === 'date' || col.kind === 'datetime') return fromSerial(v, col.kind);
    if (col.kind === 'int') return Math.round(v);
    return v;
  }

  const s = String(v).trim();
  if (s === '') return '';
  if (col.kind === 'date') return parseDateCell(s);
  if (col.kind === 'datetime') return parseStampCell(s);
  if (col.kind === 'enum') return s.toUpperCase();
  if (col.kind === 'int') {
    const direct = Number(s);
    if (Number.isFinite(direct)) return direct;
    const stripped = Number(s.replace(/[^\d.-]/g, ''));
    return Number.isFinite(stripped) ? stripped : s;
  }
  return s;
}

export type Parsed = {
  fileName: string;
  sheet: string;
  /** Field names recognised, in file order. */
  keys: string[];
  /** Header cells that matched no known column (reported, then ignored). */
  unknownColumns: string[];
  rows: Record<string, unknown>[];
};

/**
 * Read a CSV/XLSX file into rows keyed by the spec's canonical field names.
 *
 * Only recognised columns are sent — a personal `notes` column the user added
 * for themselves is ignored rather than rejected, because the backend would
 * otherwise refuse an otherwise-perfect file over an irrelevant extra.
 */
export async function readSheet(
  file: File,
  columns: TransferColumn[],
): Promise<Parsed> {
  const { read, utils } = await sheetjs();
  const wb = read(await file.arrayBuffer(), { type: 'array', cellDates: true });

  // Prefer the sheet we write ourselves, so a Guide sheet is never parsed.
  const sheet =
    wb.SheetNames.find((n) => n.trim().toLowerCase() === 'data') ?? wb.SheetNames[0];
  const aoa = utils.sheet_to_json<any[]>(wb.Sheets[sheet], {
    header: 1,
    raw: true,
    defval: '',
  });
  if (aoa.length === 0) {
    return { fileName: file.name, sheet, keys: [], unknownColumns: [], rows: [] };
  }

  const byAlias = new Map<string, TransferColumn>();
  for (const c of columns) {
    byAlias.set(normHeader(c.key), c);
    byAlias.set(normHeader(c.label), c);
  }

  const header = aoa[0] as unknown[];
  const mapped: Array<{ index: number; col: TransferColumn }> = [];
  const unknownColumns: string[] = [];
  header.forEach((h, index) => {
    const text = String(h ?? '').trim();
    if (!text) return;
    const col = byAlias.get(normHeader(text));
    if (col && !mapped.some((m) => m.col.key === col.key)) mapped.push({ index, col });
    else if (!byAlias.has(normHeader(text))) unknownColumns.push(text);
  });

  const rows: Record<string, unknown>[] = [];
  for (let i = 1; i < aoa.length; i++) {
    const raw = aoa[i];
    if (!raw || raw.every((cell) => String(cell ?? '').trim() === '')) continue;
    const out: Record<string, unknown> = {};
    for (const { index, col } of mapped) out[col.key] = importCell(raw[index], col);
    rows.push(out);
  }

  return {
    fileName: file.name,
    sheet,
    keys: mapped.map((m) => m.col.key),
    unknownColumns,
    rows,
  };
}

/** Required columns the file never mentioned — worth warning about up front. */
export const missingRequired = (parsed: Parsed, columns: TransferColumn[]) =>
  columns.filter((c) => c.required && !parsed.keys.includes(c.key)).map((c) => c.key);
