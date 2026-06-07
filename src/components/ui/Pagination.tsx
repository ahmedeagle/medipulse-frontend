import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { PAGE_SIZE_OPTIONS } from '../../types/pagination';

interface PaginationProps {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
  /** Disable controls while the next page is fetching (avoids double-clicks). */
  isLoading?: boolean;
  className?: string;
  /** Optional fixed page-size choices. Defaults to [10, 25, 50, 100]. */
  pageSizeOptions?: number[];
}

/**
 * Shared pagination footer for every list/table page.
 *
 * - Page counter: "Showing 1–25 of 320"
 * - First / Prev / Next / Last buttons
 * - Page-size dropdown (default 25)
 * - RTL-safe: uses logical layout (flex + gap), no left/right hardcoding.
 */
export default function Pagination({
  page,
  pageSize,
  total,
  totalPages,
  onPageChange,
  onPageSizeChange,
  isLoading = false,
  className,
  pageSizeOptions = PAGE_SIZE_OPTIONS,
}: PaginationProps) {
  const { t } = useTranslation();

  const start = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);

  const btn = (label: string, target: number, disabled: boolean) => (
    <button
      type="button"
      className={clsx(
        'px-3 py-1.5 text-sm rounded border border-gray-300 bg-white',
        'hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed',
      )}
      disabled={disabled || isLoading}
      onClick={() => onPageChange(target)}
    >
      {label}
    </button>
  );

  return (
    <div
      className={clsx(
        'flex flex-wrap items-center justify-between gap-3 py-3 px-1',
        className,
      )}
    >
      <div className="text-sm text-gray-600">
        {total === 0
          ? t('pagination.empty', 'لا توجد عناصر')
          : t('pagination.showing', 'عرض {{start}}–{{end}} من {{total}}', {
              start,
              end,
              total,
            })}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {onPageSizeChange && (
          <label className="text-sm text-gray-600 flex items-center gap-2">
            {t('pagination.perPage', 'لكل صفحة')}
            <select
              className="border border-gray-300 rounded px-2 py-1 text-sm bg-white"
              value={pageSize}
              disabled={isLoading}
              onChange={(e) => onPageSizeChange(Number(e.target.value))}
            >
              {pageSizeOptions.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </label>
        )}

        <div className="flex items-center gap-1">
          {btn('«', 1, page <= 1)}
          {btn('‹', page - 1, page <= 1)}
          <span className="text-sm text-gray-700 px-2">
            {t('pagination.pageOf', '{{page}} / {{total}}', {
              page,
              total: Math.max(1, totalPages),
            })}
          </span>
          {btn('›', page + 1, page >= totalPages)}
          {btn('»', totalPages, page >= totalPages)}
        </div>
      </div>
    </div>
  );
}
