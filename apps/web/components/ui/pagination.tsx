export function totalPages(total: number, limit: number): number {
  return Math.max(1, Math.ceil(total / limit));
}

interface PaginationProps {
  page: number;
  limit: number;
  total: number;
  onPageChange: (page: number) => void;
}

export function Pagination({ page, limit, total, onPageChange }: PaginationProps) {
  const pages = totalPages(total, limit);
  const canGoBack = page > 1;
  const canGoForward = page < pages;
  const start = total === 0 ? 0 : (page - 1) * limit + 1;
  const end = Math.min(total, page * limit);

  return (
    <div className="flex items-center justify-between px-1 py-3 text-sm text-slate-600">
      <span>{total === 0 ? 'No results' : `Showing ${String(start)}-${String(end)} of ${String(total)}`}</span>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => {
            onPageChange(page - 1);
          }}
          disabled={!canGoBack}
          className="rounded-lg border border-slate-300 px-3 py-1.5 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Previous
        </button>
        <button
          type="button"
          onClick={() => {
            onPageChange(page + 1);
          }}
          disabled={!canGoForward}
          className="rounded-lg border border-slate-300 px-3 py-1.5 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Next
        </button>
      </div>
    </div>
  );
}
