import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { errMsg, queryClient } from '../api';

/**
 * One submit/delete cycle: tracks busy + the server's error message, and
 * drops the react-query cache on success so every page reflects the change.
 */
export function useCrud() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const run = async (fn: () => Promise<unknown>): Promise<boolean> => {
    setBusy(true);
    setError('');
    try {
      await fn();
      await queryClient.invalidateQueries();
      return true;
    } catch (e) {
      setError(errMsg(e));
      return false;
    } finally {
      setBusy(false);
    }
  };

  return { busy, error, run, reset: () => setError('') };
}

export type Option = { value: string; label: string };

export type FieldDef = {
  name: string;
  label: string;
  type?: 'text' | 'number' | 'date' | 'datetime-local' | 'select' | 'textarea' | 'url';
  required?: boolean;
  options?: Option[];
  placeholder?: string;
  hint?: string;
  min?: number;
  max?: number;
  /** 2 makes the field span both columns of the form grid. */
  span?: 1 | 2;
  /** Renders the control but refuses edits (e.g. league_id on a team edit). */
  readOnly?: boolean;
  defaultValue?: string;
};

export type Values = Record<string, string>;

/**
 * Turn the string-valued form state into a JSON body.
 * Empty → null (matches are nullable columns), numbers become numbers and
 * `datetime-local` becomes the ISO string a `timestamptz` column expects.
 */
export function toPayload(values: Values, fields: FieldDef[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of fields) {
    const raw = (values[f.name] ?? '').trim();
    if (raw === '') {
      out[f.name] = null;
      continue;
    }
    if (f.type === 'number') out[f.name] = Number(raw);
    else if (f.type === 'datetime-local') out[f.name] = new Date(raw).toISOString();
    else out[f.name] = raw;
  }
  return out;
}

/** Initial form state, in field order. */
export function seedValues(fields: FieldDef[], initial?: Record<string, unknown>): Values {
  const v: Values = {};
  for (const f of fields) {
    const fromInitial = initial?.[f.name];
    v[f.name] =
      fromInitial === undefined || fromInitial === null ? (f.defaultValue ?? '') : String(fromInitial);
  }
  return v;
}

// ---------------------------------------------------------------- Modal

export function Modal({
  title,
  subtitle = 'FORM',
  onClose,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal" role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head">
          <div>
            <div className="eyebrow">{subtitle}</div>
            <h2>{title}</h2>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
            <X size={15} />
          </button>
        </div>

        {children}

        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Field

function Field({ def, value, onChange }: { def: FieldDef; value: string; onChange: (v: string) => void }) {
  const id = `fld-${def.name}`;
  const label = (
    <label htmlFor={id}>
      {def.label}
      {def.required && <em>*</em>}
    </label>
  );

  if (def.type === 'textarea') {
    return (
      <div className={`crud-field${def.span === 2 ? ' span2' : ''}`}>
        {label}
        <textarea
          id={id}
          rows={3}
          value={value}
          placeholder={def.placeholder}
          readOnly={def.readOnly}
          onChange={(e) => onChange(e.target.value)}
        />
        {def.hint && <small className="crud-hint">{def.hint}</small>}
      </div>
    );
  }

  return (
    <div className={`crud-field${def.span === 2 ? ' span2' : ''}`}>
      {label}
      <div className="auth-field">
        {def.type === 'select' ? (
          <select
            id={id}
            required={def.required}
            value={value}
            disabled={def.readOnly}
            onChange={(e) => onChange(e.target.value)}
          >
            {!def.required && <option value="">—</option>}
            {(def.options ?? []).map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        ) : (
          <input
            id={id}
            type={def.type ?? 'text'}
            required={def.required}
            min={def.min}
            max={def.max}
            value={value}
            placeholder={def.placeholder}
            readOnly={def.readOnly}
            onChange={(e) => onChange(e.target.value)}
          />
        )}
      </div>
      {def.hint && <small className="crud-hint">{def.hint}</small>}
    </div>
  );
}

// ---------------------------------------------------------------- Crud form

export function CrudForm({
  title,
  subtitle,
  fields,
  initial,
  submitLabel = 'Save',
  busy,
  error,
  onSubmit,
  onClose,
}: {
  title: string;
  subtitle?: string;
  fields: FieldDef[];
  initial?: Record<string, unknown>;
  submitLabel?: string;
  busy?: boolean;
  error?: string;
  onSubmit: (payload: Record<string, unknown>) => void;
  onClose: () => void;
}) {
  const [values, setValues] = useState<Values>(() => seedValues(fields, initial));

  const submit = (e: FormEvent) => {
    e.preventDefault();
    onSubmit(toPayload(values, fields));
  };

  return (
    <Modal
      title={title}
      subtitle={subtitle}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn-ghost" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button
            type="submit"
            form="crud-form"
            className="btn-primary"
            disabled={busy}
          >
            {busy ? 'Saving…' : submitLabel}
          </button>
        </>
      }
    >
      <form id="crud-form" className="crud-form" onSubmit={submit}>
        {error && <div className="auth-error">{error}</div>}
        <div className="crud-grid">
          {fields.map((f) => (
            <Field
              key={f.name}
              def={f}
              value={values[f.name] ?? ''}
              onChange={(v) => setValues((s) => ({ ...s, [f.name]: v }))}
            />
          ))}
        </div>
      </form>
    </Modal>
  );
}

// ---------------------------------------------------------------- Confirm

export function Confirm({
  title,
  subtitle = 'CONFIRM',
  message,
  facts,
  confirmLabel = 'Delete',
  busy,
  error,
  onConfirm,
  onClose,
}: {
  title: string;
  subtitle?: string;
  message: ReactNode;
  /** e.g. ["12 players will also be removed"] — shown as a bullet list. */
  facts?: string[];
  confirmLabel?: string;
  busy?: boolean;
  error?: string;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Modal
      title={title}
      subtitle={subtitle}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn-ghost" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="button" className="btn-warn" onClick={onConfirm} disabled={busy}>
            {busy ? 'Working…' : confirmLabel}
          </button>
        </>
      }
    >
      <div className="confirm-body">
        <span className="confirm-icon">
          <AlertTriangle size={18} />
        </span>
        <div>
          <p>{message}</p>
          {facts && facts.length > 0 && (
            <ul className="confirm-facts">
              {facts.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
          )}
          {error && <div className="auth-error">{error}</div>}
        </div>
      </div>
    </Modal>
  );
}
