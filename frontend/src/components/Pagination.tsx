import { useEffect, useState } from 'react';

type Options = {
  /** Rows shown per page. */
  pageSize?: number;
  /** Changing this value sends the user back to page 1 (search/filter/league). */
  resetKey?: string;
};

/**
 * Client-side pagination. The dataset already lives in memory (and the table
 * rows are filtered locally by search), so slicing here keeps filtering,
 * sorting and pagination in sync without extra round-trips.
 */
export function usePagination(
  total: number,
  { pageSize: initial = 10, resetKey = '' }: Options = {},
) {
  const [page, setPageRaw] = useState(1);
  const [size, setSizeRaw] = useState(initial);

  useEffect(() => {
    setPageRaw(1);
  }, [resetKey]);

  const totalPages = Math.max(1, Math.ceil(total / size));
  const current = Math.min(Math.max(1, page), totalPages); // clamp, never stale
  const startIndex = total === 0 ? 0 : (current - 1) * size;
  const endIndex = Math.min(startIndex + size, total);

  return {
    page: current,
    pageSize: size,
    totalPages,
    startIndex,
    endIndex,
    from: total === 0 ? 0 : startIndex + 1,
    to: endIndex,
    setPage: setPageRaw,
    setPageSize: (n: number) => {
      setSizeRaw(n);
      setPageRaw(1);
    },
  };
}

/** 1 … 4 5 6 … 12 style window around the current page. */
function pageList(page: number, total: number): Array<number | '…'> {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);

  const items = new Set<number>([1, total, page, page - 1, page + 1]);
  if (page <= 3) [2, 3, 4].forEach((n) => items.add(n));
  if (page >= total - 2) [total - 3, total - 2, total - 1].forEach((n) => items.add(n));

  const sorted = [...items].filter((n) => n >= 1 && n <= total).sort((a, b) => a - b);
  const out: Array<number | '…'> = [];
  let prev = 0;
  for (const n of sorted) {
    if (prev && n - prev > 1) out.push('…');
    out.push(n);
    prev = n;
  }
  return out;
}

type Props = {
  page: number;
  totalPages: number;
  from: number;
  to: number;
  total: number;
  onPage: (page: number) => void;
  pageSize?: number;
  onPageSize?: (size: number) => void;
  sizes?: number[];
};

export function Pagination({
  page,
  totalPages,
  from,
  to,
  total,
  onPage,
  pageSize,
  onPageSize,
  sizes = [10, 25, 50],
}: Props) {
  if (total === 0) return null;

  return (
    <div className="pagination">
      <span className="pag-info">
        Showing <b>{from}–{to}</b> of <b>{total}</b>
      </span>

      <div className="pag-right">
        {onPageSize && (
          <label className="pag-size">
            Rows
            <select
              value={pageSize}
              onChange={(e) => onPageSize(Number(e.target.value))}
            >
              {sizes.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
        )}

        <div className="pag-buttons">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => onPage(page - 1)}
            aria-label="Previous page"
          >
            ‹ Prev
          </button>

          {pageList(page, totalPages).map((item, i) =>
            item === '…' ? (
              <span key={`gap-${i}`} className="pag-ellipsis">
                …
              </span>
            ) : (
              <button
                key={item}
                type="button"
                className={item === page ? 'active' : ''}
                onClick={() => onPage(item)}
                aria-current={item === page ? 'page' : undefined}
              >
                {item}
              </button>
            ),
          )}

          <button
            type="button"
            disabled={page >= totalPages}
            onClick={() => onPage(page + 1)}
            aria-label="Next page"
          >
            Next ›
          </button>
        </div>
      </div>
    </div>
  );
}
