import { useRef, useState, type ChangeEvent } from 'react';
import { CheckCircle2, ChevronDown, Download, FilePlus2, Sheet, Upload } from 'lucide-react';
import { api, errMsg, queryClient } from '../api';
import { isAdmin } from '../auth';
import { Modal } from './ui';
import {
  downloadCsv,
  downloadXlsx,
  missingRequired,
  readSheet,
  type Parsed,
  type TransferColumn,
} from '../lib/transfer';

export type ImportEntity = 'leagues' | 'teams' | 'players' | 'matches';

type Problem = { row: number; column?: string; message: string };
type Report = {
  entity: string;
  created: number;
  updated: number;
  total: number;
  stats_written?: number;
};

/**
 * `⤓ Export` / `⤒ Import` for a table.
 *
 * Export is available to every signed-in account (it only reads what the page
 * already shows); Import is ADMIN-only, mirroring `@Roles(Role.ADMIN)` on
 * `POST /api/import/:entity` — so a USER never sees a button that would 403.
 */
export function Transfer({
  entity,
  base,
  columns,
  rows,
  noun,
}: {
  entity: ImportEntity;
  /** File-name stem, e.g. `teams`. */
  base: string;
  columns: TransferColumn[];
  /** Everything currently filtered into the table — not just the visible page. */
  rows: any[];
  /** Singular noun used in copy: "team", "fixture". */
  noun: string;
}) {
  const [menu, setMenu] = useState(false);
  const [open, setOpen] = useState(false);
  const admin = isAdmin();

  return (
    <div className="transfer">
      {menu && <div className="menu-scrim" onClick={() => setMenu(false)} />}

      <div className="menu-wrap">
        <button
          type="button"
          className="btn-ghost btn-sm"
          aria-expanded={menu}
          onClick={() => setMenu((v) => !v)}
        >
          <Download size={14} /> Export <ChevronDown size={13} />
        </button>

        {menu && (
          <div className="menu-pop" role="menu">
            <button type="button" onClick={() => { downloadCsv(base, columns, rows); setMenu(false); }}>
              <Sheet size={16} />
              <span>
                <b>CSV</b>
                <small>Opens straight in Excel or Sheets</small>
              </span>
            </button>
            <button type="button" onClick={() => { downloadXlsx(base, columns, rows); setMenu(false); }}>
              <Sheet size={16} />
              <span>
                <b>Excel (.xlsx)</b>
                <small>Data sheet + column guide</small>
              </span>
            </button>
            <button type="button" onClick={() => { downloadXlsx(base, columns, [], true); setMenu(false); }}>
              <FilePlus2 size={16} />
              <span>
                <b>Blank template</b>
                <small>Headers and guide only</small>
              </span>
            </button>
          </div>
        )}
      </div>

      {admin && (
        <button type="button" className="btn-ghost btn-sm" onClick={() => setOpen(true)}>
          <Upload size={14} /> Import
        </button>
      )}

      {open && (
        <ImportModal
          entity={entity}
          columns={columns}
          noun={noun}
          rowCount={rows.length}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  );
}

// ------------------------------------------------------------------ import

function ImportModal({
  entity,
  columns,
  noun,
  rowCount,
  onClose,
}: {
  entity: ImportEntity;
  columns: TransferColumn[];
  noun: string;
  /** How many rows export would have produced — shown after a success. */
  rowCount: number;
  onClose: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [parsed, setParsed] = useState<Parsed | null>(null);
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [problems, setProblems] = useState<Problem[]>([]);
  const [done, setDone] = useState<Report | null>(null);

  const pick = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-picking the same file after a fix
    if (!file) return;
    setNotice('');
    setProblems([]);
    setDone(null);
    try {
      const result = await readSheet(file, columns);
      if (result.rows.length === 0) {
        setParsed(null);
        setNotice(`"${file.name}" has no data rows below its header.`);
        return;
      }
      setParsed(result);
    } catch {
      setParsed(null);
      setNotice(`Could not read "${file.name}". Use a .csv or .xlsx file.`);
    }
  };

  const submit = async () => {
    if (!parsed) return;
    setBusy(true);
    setNotice('');
    setProblems([]);
    try {
      const r = await api.post(`/import/${entity}`, { rows: parsed.rows });
      setDone(r.data?.data ?? null);
      await queryClient.invalidateQueries();
    } catch (e: any) {
      const body = e?.response?.data;
      setProblems(Array.isArray(body?.errors) ? body.errors : []);
      setNotice(body?.message || errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  const missing = parsed ? missingRequired(parsed, columns) : [];
  const shown = parsed ? columns.filter((c) => parsed.keys.includes(c.key)) : [];

  const footer = done ? (
    <button type="button" className="btn-primary" onClick={onClose}>
      Done
    </button>
  ) : parsed ? (
    <>
      <button type="button" className="btn-ghost" onClick={onClose} disabled={busy}>
        Cancel
      </button>
      <button type="button" className="btn-primary" onClick={submit} disabled={busy}>
        {busy ? 'Importing…' : `Import ${parsed.rows.length} row(s)`}
      </button>
    </>
  ) : (
    <button type="button" className="btn-ghost" onClick={onClose}>
      Cancel
    </button>
  );

  return (
    <Modal title={`Import ${noun}s`} subtitle="SPREADSHEET" onClose={onClose} footer={footer}>
      {done ? (
        <div className="imp-ok">
          <CheckCircle2 size={20} />
          <div>
            <b>Import complete — nothing was left half-written.</b>
            <p>
              {done.created} created, {done.updated} updated
              {done.stats_written ? `, ${done.stats_written} player-statistics rows rebuilt` : ''}
              . The table now has {rowCount} row(s).
            </p>
          </div>
        </div>
      ) : (
        <>
          {notice && <div className="auth-error">{notice}</div>}

          {problems.length > 0 && (
            <div className="imp-problems">
              <div className="imp-problems-head">
                {problems.length} problem(s) — fix them in the file and pick it again.
                Rows are counted from the first row <i>below</i> the header.
              </div>
              <ul>
                {problems.slice(0, 40).map((p, i) => (
                  <li key={i}>
                    <b>Row {p.row}</b>
                    {p.column ? ` · ${p.column}` : ''} — {p.message}
                  </li>
                ))}
              </ul>
              {problems.length > 40 && (
                <div className="muted">…and {problems.length - 40} more.</div>
              )}
            </div>
          )}

          {!parsed && (
            <>
              <p className="imp-lede">
                Pick a CSV or Excel file. The first row must be the header. A blank
                <b> id</b> column means <b>create</b>; a filled one means <b>update</b>
                that existing record.
              </p>

              <button type="button" className="imp-drop" onClick={() => input.current?.click()}>
                <Upload size={18} />
                <span>Choose a file…</span>
                <small>.csv · .xlsx · .xls</small>
              </button>

              <div className="imp-cols">
                <div className="imp-cols-head">
                  <span>Expected columns</span>
                  <button
                    type="button"
                    className="link"
                    onClick={() => downloadXlsx(base_of(entity), columns, [], true)}
                  >
                    Download template
                  </button>
                </div>
                <ul>
                  {columns.map((c) => (
                    <li key={c.key} className={c.required ? 'req' : ''}>
                      {c.key}
                      {c.values ? <em>{c.values.join(' / ')}</em> : null}
                    </li>
                  ))}
                </ul>
              </div>
            </>
          )}

          {parsed && (
            <>
              <div className="imp-file">
                <Sheet size={16} />
                <span>
                  <b>{parsed.fileName}</b>
                  <small>
                    sheet “{parsed.sheet}” · {parsed.rows.length} data row(s) ·{' '}
                    {parsed.keys.length} column(s) matched
                  </small>
                </span>
                <button type="button" className="link" onClick={() => setParsed(null)}>
                  Change file
                </button>
              </div>

              {missing.length > 0 && (
                <div className="auth-error">
                  Missing required column(s): {missing.join(', ')}.
                </div>
              )}
              {parsed.unknownColumns.length > 0 && (
                <p className="muted imp-note">
                  Ignored unknown column(s): {parsed.unknownColumns.join(', ')}.
                </p>
              )}

              <div className="table-wrap imp-preview">
                <table>
                  <thead>
                    <tr>
                      {shown.map((c) => (
                        <th key={c.key}>
                          {c.key}
                          {c.required ? <em>*</em> : null}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {parsed.rows.slice(0, 5).map((r, i) => (
                      <tr key={i}>
                        {shown.map((c) => (
                          <td key={c.key}>{String(r[c.key] ?? '') || '—'}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {parsed.rows.length > 5 && (
                <p className="muted imp-note">
                  Showing the first 5 of {parsed.rows.length} row(s).
                </p>
              )}
            </>
          )}

          <input
            ref={input}
            type="file"
            accept=".csv,.xlsx,.xls,text/csv"
            onChange={pick}
            hidden
          />
        </>
      )}
    </Modal>
  );
}

/** File-name stem for the template download. */
const base_of = (entity: ImportEntity) => entity;
