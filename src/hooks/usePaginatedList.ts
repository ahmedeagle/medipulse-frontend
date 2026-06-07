import { useCallback, useMemo, useState } from 'react';
import { useQuery, keepPreviousData, type QueryKey } from '@tanstack/react-query';
import {
  DEFAULT_PAGE_SIZE,
  type PaginatedResult,
  type PaginationParams,
} from '../types/pagination';

/**
 * Generic paginated-list hook backed by React Query.
 *
 * - Default page size: 25 (matches backend default).
 * - Stable `page`, `pageSize`, `setPage`, `setPageSize` so list pages don't
 *   reinvent offset math.
 * - `keepPreviousData` keeps the table visible while the next page loads
 *   (prevents a full-screen flicker on pagination clicks).
 *
 * Usage:
 *   const list = usePaginatedList({
 *     queryKey: ['inventory'],
 *     fetchPage: ({ limit, offset }) =>
 *       inventoryApi.getAll({ limit, offset }).then((r) => r.data),
 *   });
 *   list.items, list.total, list.page, list.totalPages, list.setPage(...)
 */
export interface UsePaginatedListOptions<T> {
  queryKey: QueryKey;
  fetchPage: (params: PaginationParams) => Promise<PaginatedResult<T>>;
  initialPageSize?: number;
  enabled?: boolean;
}

export function usePaginatedList<T>({
  queryKey,
  fetchPage,
  initialPageSize = DEFAULT_PAGE_SIZE,
  enabled = true,
}: UsePaginatedListOptions<T>) {
  const [pageSize, setPageSizeState] = useState(initialPageSize);
  const [page, setPageState] = useState(1); // 1-based for UI ergonomics

  const offset = (page - 1) * pageSize;

  const query = useQuery({
    queryKey: [...queryKey, { limit: pageSize, offset }],
    queryFn: () => fetchPage({ limit: pageSize, offset }),
    placeholderData: keepPreviousData,
    enabled,
  });

  const total = query.data?.total ?? 0;
  const totalPages = useMemo(
    () => (total === 0 ? 1 : Math.ceil(total / pageSize)),
    [total, pageSize],
  );

  const setPage = useCallback(
    (next: number) => setPageState(Math.min(Math.max(1, next), Math.max(1, totalPages))),
    [totalPages],
  );

  /** Changing page size resets to page 1 — the previous offset is meaningless. */
  const setPageSize = useCallback((size: number) => {
    setPageSizeState(size);
    setPageState(1);
  }, []);

  return {
    items: query.data?.data ?? [],
    total,
    page,
    pageSize,
    totalPages,
    setPage,
    setPageSize,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}
